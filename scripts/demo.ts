/**
 * End-to-end demo of the OpenLoop agent loop, without any UI.
 *
 *   bun scripts/demo.ts
 *
 * Runs a real Strands agent over two completely different simulated external
 * systems — a refund and a recommendation letter — using the same agent, the
 * same tools registry, and the same persistent loop model. The only difference
 * between the two runs is which external record the outcome resolves to.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DemoActionKind, LoopStatus } from "../shared/types";
import { EventBus } from "../server/agent/events";
import { AgentRuntime } from "../server/agent/runtime";
import { OpenLoopService } from "../server/agent/service";
import { OpenLoopStore } from "../server/state/store";

const STATUS_MARK: Record<LoopStatus, string> = {
  ACTIVE: "◐",
  WAITING: "◷",
  NEEDS_HUMAN: "◆",
  AT_RISK: "!",
  RESOLVED: "✓",
};

function header(text: string): void {
  console.log(`\n${"─".repeat(74)}\n${text}\n${"─".repeat(74)}`);
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "openloop-demo-"));
  const store = OpenLoopStore.open(join(dir, "openloop.json"));
  const bus = new EventBus();
  const runtime = new AgentRuntime(store, bus);
  const service = new OpenLoopService(store, runtime);

  bus.subscribe((event) => {
    if (event.type === "step" && event.step.type === "tool_call") {
      console.log(`   · ${event.step.text}`);
    }
  });

  const model = await runtime.getModel();
  console.log(`model: ${model.provider}/${model.modelId}`);
  if (model.simulated) console.log(`note:  ${model.note}`);

  /** Hand an outcome to OpenLoop and drive its external system to completion. */
  async function runScenario(options: {
    label: string;
    outcome: string;
    script: { step: DemoActionKind; after: string }[];
  }): Promise<{ resolved: boolean; loopId: string }> {
    header(`Outcome: “${options.outcome}”`);

    // The same service the HTTP API uses — one creation path, not two.
    const { loop, intake } = await service.createFromOutcome({
      outcome: options.outcome,
      autoRun: false,
    });
    console.log(`   → resolved to external record: ${String(intake.context.caseId ?? "(none)")}`);
    console.log(`   → target state: ${String(intake.context.completeStatus ?? "(unknown)")}`);

    const runOnce = async (heading: string) => {
      header(heading);
      await runtime.run(loop.id, "manual");
      const current = store.getLoop(loop.id)!;
      console.log(`\n   ${STATUS_MARK[current.status]} ${current.status} — ${current.lastAction}`);
      if (current.waitingFor) console.log(`   waiting for: ${current.waitingFor}`);
    };

    await runOnce(`${options.label} — the agent takes ownership and acts on its own`);

    const caseId = typeof intake.context.caseId === "string" ? intake.context.caseId : undefined;

    for (const move of options.script) {
      header(`${options.label} — the outside world moves (${move.step})`);
      const result = store.simulation().applyDemoAction({ action: move.step, caseId });
      console.log(`   ${result.detail}`);
      await runOnce(move.after);
    }

    const finished = store.getLoop(loop.id)!;
    header(`${options.label} — result`);
    console.log(`   status: ${STATUS_MARK[finished.status]} ${finished.status}`);
    console.log(`   ${finished.resolutionSummary ?? "(unresolved)"}`);

    header(`${options.label} — activity timeline`);
    for (const entry of finished.activityLog) {
      const tag = entry.transition ? `STATE ${entry.transition.from}→${entry.transition.to}` : entry.kind;
      console.log(`   ✓ [${tag}] ${entry.summary}`);
    }

    return { resolved: finished.status === "RESOLVED", loopId: loop.id };
  }

  /* Scenario 1 — a refund that was approved but never paid. */
  const refund = await runScenario({
    label: "Refund",
    outcome: "Make sure my $184.99 refund from Acme Electronics gets resolved.",
    script: [
      { step: "COUNTERPARTY_RESPONDS", after: "Refund — a reply arrives that changes nothing" },
      { step: "ADVANCE_ONE_STEP", after: "Refund — the agent notices approval" },
      { step: "ADVANCE_ONE_STEP", after: "Refund — the agent notices the release" },
      { step: "ADVANCE_ONE_STEP", after: "Refund — the agent verifies the credit" },
    ],
  });

  /* Scenario 2 — a letter that was promised but never delivered, where the
   * blocker turns out to be something only the account owner can supply. */
  const blockedLetter = await runScenario({
    label: "Letter (blocked)",
    outcome: "Make sure my school recommendation request gets completed.",
    script: [
      { step: "COUNTERPARTY_NEEDS_INFO", after: "Letter — the counsellor needs something only the owner has" },
    ],
  });
  const escalated = store.getLoop(blockedLetter.loopId)!.status === "NEEDS_HUMAN";

  /* Scenario 3 — the same letter case, but where the counsellor delivers.
   * Same agent, same tools, same loop model: only the external record differs.
   * The world is reset first so this scenario starts from the untouched seed
   * state rather than inheriting the blocker the previous run uncovered. */
  store.simulation().applyDemoAction({ action: "RESET_SCENARIO" });
  const deliveredLetter = await runScenario({
    label: "Letter (delivered)",
    outcome: "Make sure my recommendation letter for Westbrook gets sent.",
    script: [
      { step: "ADVANCE_ONE_STEP", after: "Letter — the agent notices the letter was drafted" },
      { step: "ADVANCE_ONE_STEP", after: "Letter — the agent notices it was submitted" },
      { step: "ADVANCE_ONE_STEP", after: "Letter — the agent verifies the university received it" },
    ],
  });

  header("Summary");
  console.log(`   refund scenario:   ${refund.resolved ? "✓ RESOLVED" : "✗ not resolved"}`);
  console.log(`   blocked letter:    ${escalated ? "✓ NEEDS_HUMAN (escalated to the owner)" : "✗ did not escalate"}`);
  console.log(`   delivered letter:  ${deliveredLetter.resolved ? "✓ RESOLVED" : "✗ not resolved"}`);

  store.flush();
  const failures = [!refund.resolved, !escalated, !deliveredLetter.resolved].filter(Boolean).length;
  if (failures > 0) {
    console.error(`\n${failures} scenario(s) behaved unexpectedly.\n`);
    process.exitCode = 1;
  } else {
    console.log("\nDemo complete.\n");
  }
}

await main();
