import type { CreateLoopInput, LoopPriority, OpenLoop } from "../../shared/types";
import type { OpenLoopStore } from "../state/store";
import { activity } from "./activity";
import { intakeOutcome, type IntakeResult } from "./intake";
import type { AgentRuntime } from "./runtime";

export interface CreateLoopResult {
  loop: OpenLoop;
  /** Exactly what intake concluded, so callers and tests can assert on it. */
  intake: IntakeResult;
}

export interface CreateLoopOptions extends CreateLoopInput {
  /**
   * Whether the agent should take ownership immediately. Defaults to true —
   * handing over an outcome and having nothing happen would be a bug.
   */
  autoRun?: boolean;
}

/**
 * The OpenLoop application service.
 *
 * Both the HTTP API and the CLI demo go through here, so there is exactly one
 * way an open loop is born and exactly one way an owner's answer re-enters the
 * system. Nothing outside the agent's own tools writes an agent-authored field
 * (status, next action, waiting-for, timeline conclusions) — this service and
 * the transport layer beneath it only ever record facts.
 */
export class OpenLoopService {
  constructor(
    private readonly store: OpenLoopStore,
    private readonly runtime: AgentRuntime,
  ) {}

  /**
   * Turn a sentence into a durable obligation and hand it to the agent.
   *
   * Intake asks the external systems which record this outcome is about; it
   * never guesses from a keyword list of its own. If no system recognises the
   * outcome, the loop is created anyway with no external grounding, and the
   * agent discovers that through its tools on the first run.
   */
  async createFromOutcome(options: CreateLoopOptions): Promise<CreateLoopResult> {
    const outcome = options.outcome.trim();
    if (outcome.length < 8) {
      throw new Error("Describe the outcome in at least a few words.");
    }

    const resolved = await this.runtime.getModel();
    const intake = await intakeOutcome(outcome, this.store.providers(), resolved);
    const priority: LoopPriority = options.priority ?? intake.priority;

    const loop = this.store.createLoop({
      title: intake.title,
      desiredOutcome: intake.desiredOutcome,
      description: intake.description,
      priority,
      deadline: options.deadline ?? intake.deadline,
      completionCriteria: intake.completionCriteria,
      relevantEntities: intake.relevantEntities,
      context: intake.context,
    });
    this.store.flush();

    if (options.autoRun !== false) {
      void this.runtime.run(loop.id, "created").catch((error) => {
        console.error(`[openloop] initial run failed for ${loop.id}`, error);
      });
    }

    return { loop, intake };
  }

  /**
   * The account owner has answered a question the agent could not answer alone.
   *
   * This records what the owner said — verbatim, in the loop's own words — and
   * clears the outstanding request. It deliberately does *not* invent a new
   * status, waiting-for, or next action: those are the agent's conclusions, and
   * the agent reaches them on the run below, with the owner's answer in hand.
   */
  async respondToHuman(loopId: string, response: string): Promise<OpenLoop> {
    const answer = response.trim();
    if (!answer) throw new Error("response is required");

    const loop = this.store.getLoop(loopId);
    if (!loop) throw new Error(`Open loop ${loopId} does not exist`);

    this.store.appendActivity(loopId, [
      activity("ACTION", "You answered OpenLoop", { detail: answer, tool: "human-response" }),
    ]);
    // The owner's own words are durable context the agent acts on, not a note.
    this.store.patchLoop(loopId, {
      humanRequest: null,
      context: { ...loop.context, latestOwnerResponse: answer },
    });
    this.store.flush();

    await this.runtime.run(loopId, "manual").catch((error) => {
      console.error(`[openloop] resume run failed for ${loopId}`, error);
    });

    const updated = this.store.getLoop(loopId);
    if (!updated) throw new Error(`Open loop ${loopId} disappeared while resuming`);
    return updated;
  }
}
