import { Agent, AfterToolCallEvent, BeforeToolCallEvent, ContentBlockEvent } from "@strands-agents/sdk";
import type { AgentInfo, LoopStatus, OpenLoop, RunOutcome, RunStep, RunTrigger } from "../../shared/types";
import type { OpenLoopStore } from "../state/store";
import { buildOpenLoopTools, describeToolCall, type ToolContext } from "../tools";
import { activity, stateChange, step } from "./activity";
import type { EventBus } from "./events";
import { resolveModel, type ResolvedModel } from "./model";
import { messageText } from "./policy-model";
import { buildRunPrompt, SYSTEM_PROMPT } from "./prompt";

function outcomeFor(status: LoopStatus): RunOutcome {
  switch (status) {
    case "RESOLVED":
      return "RESOLVED";
    case "NEEDS_HUMAN":
      return "NEEDS_HUMAN";
    case "WAITING":
      return "WAITING";
    case "AT_RISK":
      return "AT_RISK";
    default:
      return "UPDATED";
  }
}

function resultSummaryOf(tool: string, ok: boolean): string {
  if (!ok) return `${tool.replace(/_/g, " ")} failed — the agent continued with what it had`;
  switch (tool) {
    case "search_email":
      return "Mailbox results returned";
    case "send_email":
      return "Message delivered into the external environment";
    case "check_refund_status":
      return "Merchant record returned";
    case "check_external_response":
      return "Reply check complete";
    case "create_reminder":
      return "Owner notified";
    case "update_loop":
      return "Loop state committed";
    default:
      return "Tool completed";
  }
}

/**
 * Runs the Strands agent loop against one open loop.
 *
 * One run = one full pass of investigate → act → interpret → commit. The loop
 * (not the process, and not the model's context window) carries the state
 * between runs, which is why OpenLoop can be interrupted, restarted, or
 * rescheduled without losing the thread.
 */
export class AgentRuntime {
  private readonly inFlight = new Map<string, Promise<{ runId: string; loop: OpenLoop }>>();
  private resolved: ResolvedModel | null = null;

  constructor(
    private readonly store: OpenLoopStore,
    private readonly bus: EventBus,
  ) {}

  async getModel(): Promise<ResolvedModel> {
    if (!this.resolved) this.resolved = await resolveModel();
    return this.resolved;
  }

  async info(): Promise<AgentInfo> {
    const resolved = await this.getModel();
    return {
      provider: resolved.provider,
      modelId: resolved.modelId,
      simulated: resolved.simulated,
      reasoning: resolved.reasoning,
      note: resolved.note,
      monitorEnabled: process.env.OPENLOOP_MONITOR !== "off",
      monitorIntervalMs: Number(process.env.OPENLOOP_MONITOR_INTERVAL_MS ?? 5000),
    };
  }

  isRunning(loopId: string): boolean {
    return this.inFlight.has(loopId);
  }

  /** Serialise runs per loop so two triggers can never fight over one outcome. */
  run(loopId: string, trigger: RunTrigger): Promise<{ runId: string; loop: OpenLoop }> {
    const existing = this.inFlight.get(loopId);
    if (existing) return existing;

    const promise = this.execute(loopId, trigger).finally(() => {
      this.inFlight.delete(loopId);
    });
    this.inFlight.set(loopId, promise);
    return promise;
  }

  private async execute(loopId: string, trigger: RunTrigger): Promise<{ runId: string; loop: OpenLoop }> {
    const initialLoop = this.store.getLoop(loopId);
    if (!initialLoop) throw new Error(`Open loop ${loopId} does not exist`);

    const resolved = await this.getModel();
    // The agent's entire view of the outside world. It is handed the provider
    // interfaces and never the simulated implementation behind them.
    const external = this.store.providers();
    const run = this.store.createRun({
      loopId,
      model: `${resolved.provider}/${resolved.modelId}`,
      trigger,
    });

    this.bus.publish({
      type: "run_started",
      runId: run.id,
      loopId,
      trigger,
      model: run.model,
      at: run.startedAt,
    });

    const previousStatus = initialLoop.status;
    let commits = 0;
    // The agent legitimately re-reads the same record after new information
    // arrives; the timeline should not repeat itself because of it.
    const loggedThisRun = new Set<string>();
    const publish = (loop: OpenLoop) => {
      this.bus.publish({ type: "loop_updated", runId: run.id, loop });
    };
    const recordStep = (entry: RunStep) => {
      this.store.appendRunStep(run.id, entry);
      this.bus.publish({ type: "step", runId: run.id, step: entry });
    };

    const ctx: ToolContext = {
      runId: run.id,
      loopId,
      trigger,
      store: this.store,
      providers: external,
      emit: recordStep,
      logActivity: (kind, summary, options) => {
        const key = `${kind}|${summary}|${options?.detail ?? ""}`;
        if (loggedThisRun.has(key)) return;
        loggedThisRun.add(key);
        const updated = this.store.appendActivity(loopId, [activity(kind, summary, options)]);
        if (updated) publish(updated);
      },
      logStateChange: (from, to, reason) => {
        const updated = this.store.appendActivity(loopId, [stateChange(from, to, reason)]);
        if (updated) publish(updated);
      },
      publishLoop: (loop) => {
        commits += 1;
        publish(loop);
      },
    };

    // While the agent works, the loop is ACTIVE. update_loop overwrites this.
    const activeLoop = this.store.patchLoop(loopId, {
      status: "ACTIVE",
      runCount: initialLoop.runCount + 1,
      lastRunAt: Date.now(),
    });
    if (activeLoop) publish(activeLoop);
    if (previousStatus !== "ACTIVE") {
      ctx.logStateChange(
        previousStatus,
        "ACTIVE",
        `Agent run started (${trigger.replace("_", " ")})`,
      );
    }

    const agent = new Agent({
      model: resolved.model,
      systemPrompt: SYSTEM_PROMPT,
      tools: buildOpenLoopTools(ctx),
      printer: false,
      retryStrategy: null,
      toolExecutor: "sequential",
      name: "OpenLoop",
      description: "An autonomous agent that owns unfinished outcomes until they are resolved.",
    });

    agent.addHook(BeforeToolCallEvent, (event) => {
      const summary = describeToolCall(event.toolUse.name, event.toolUse.input);
      recordStep(step("tool_call", summary, { tool: event.toolUse.name }));
    });

    agent.addHook(AfterToolCallEvent, (event) => {
      const ok = event.result.status === "success";
      recordStep(
        step("tool_result", resultSummaryOf(event.toolUse.name, ok), {
          tool: event.toolUse.name,
          ok,
        }),
      );
    });

    agent.addHook(ContentBlockEvent, (event) => {
      const block = event.contentBlock as { type?: string; text?: string };
      if (block.type !== "textBlock") return;
      const text = (block.text ?? "").trim();
      // The model echoes the brief back on some providers; keep it out of the UI.
      if (!text || text.includes("<openloop_context>")) return;
      recordStep(step("thought", text));
    });

    let error: string | null = null;
    try {
      const prompt = buildRunPrompt({
        loop: initialLoop,
        trigger,
        worldRevision: external.revision,
        worldChangeLabel: external.lastChangeLabel,
        previousRuns: this.store.runsForLoop(loopId).filter((r) => r.id !== run.id),
        simulatedNow: new Date().toISOString(),
      });

      const result = await agent.invoke(prompt);
      const finalText = messageText(result.lastMessage).trim();
      if (finalText) recordStep(step("final", finalText));

      if (commits === 0) {
        recordStep(
          step(
            "final",
            "The agent finished without updating the loop's state. The previous state was preserved.",
          ),
        );
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      console.error(`[openloop] run ${run.id} failed:`, caught);
      // Never leave a loop stranded in ACTIVE because of a runtime failure.
      this.store.patchLoop(loopId, {
        status: previousStatus === "ACTIVE" ? "AT_RISK" : previousStatus,
        currentState: `The last agent run failed: ${error}`,
        nextAction: "Retry the run",
      });
      this.store.appendActivity(loopId, [
        activity("ERROR", "An agent run failed before it could commit a new state", {
          detail: error,
        }),
      ]);
    }

    // Record the external revision the agent has now seen, so the monitor only
    // wakes this loop up when something genuinely new happens.
    this.store.patchLoop(loopId, { lastObservedRevision: external.revision });

    const finalLoop = this.store.getLoop(loopId);
    if (!finalLoop) throw new Error(`Open loop ${loopId} disappeared during its run`);

    this.store.finishRun(run.id, {
      outcome: error ? "ERROR" : outcomeFor(finalLoop.status),
      error,
    });

    this.bus.publish({
      type: "run_finished",
      runId: run.id,
      loop: finalLoop,
      outcome: error ? "ERROR" : outcomeFor(finalLoop.status),
      error,
      at: Date.now(),
    });

    return { runId: run.id, loop: finalLoop };
  }
}
