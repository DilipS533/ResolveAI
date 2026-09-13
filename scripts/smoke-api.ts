/**
 * End-to-end HTTP smoke test.
 *
 *   bun scripts/smoke-api.ts
 *
 * Boots the real API server on an ephemeral port and drives two completely
 * different outcomes through the public HTTP surface — including the SSE event
 * stream and the demo controls — asserting that the agent, not the UI, is what
 * decides the state.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { CaseSummary, LoopBundle, LoopStatus, RunEvent, ExternalWorldSnapshot } from "../shared/types";
import { createApiServer } from "../server/api/server";
import { EventBus } from "../server/agent/events";
import { LoopMonitor } from "../server/agent/monitor";
import { AgentRuntime } from "../server/agent/runtime";
import { OpenLoopService } from "../server/agent/service";
import { OpenLoopStore } from "../server/state/store";

const REFUND_OUTCOME = "Make sure my $184.99 refund from Acme Electronics gets resolved.";
const LETTER_OUTCOME = "Make sure my school recommendation request gets completed.";

let failures = 0;

function check(label: string, condition: boolean, extra = ""): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

async function waitFor(
  predicate: () => Promise<boolean>,
  label: string,
  timeoutMs = 25_000,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  console.log(`  ! timed out waiting for ${label}`);
  return false;
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "openloop-smoke-"));
  const file = join(dir, "openloop.json");
  const store = OpenLoopStore.open(file);
  const bus = new EventBus();
  const runtime = new AgentRuntime(store, bus);
  const service = new OpenLoopService(store, runtime);
  const monitor = new LoopMonitor(store, runtime, 5_000);
  const distDir = resolve(process.cwd(), "dist");
  const server = createApiServer({
    store,
    runtime,
    service,
    bus,
    monitor,
    staticDir: existsSync(distDir) ? distDir : undefined,
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;
  console.log(`\nAPI listening on ${base}\n`);

  const events: RunEvent[] = [];
  const controller = new AbortController();
  void (async () => {
    try {
      const stream = await fetch(`${base}/api/events`, { signal: controller.signal });
      const reader = stream.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const parsed = JSON.parse(line.slice(6)) as { type?: string };
          if (parsed.type && parsed.type !== "hello") events.push(parsed as RunEvent);
        }
      }
    } catch {
      /* aborted on shutdown */
    }
  })();

  const get = async (path: string) => {
    const response = await fetch(`${base}${path}`);
    return { status: response.status, body: (await response.json()) as unknown };
  };
  const post = async (path: string, payload: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: (await response.json()) as unknown };
  };
  const loop = async (id: string) => (await get(`/api/loops/${id}`)).body as LoopBundle;
  const simulation = async () => (await get("/api/simulation")).body as ExternalWorldSnapshot;

  /** Move the outside world. The monitor then notices and re-runs the agent. */
  const act = async (action: string, caseId: string) =>
    (await post("/api/simulation/action", { action, caseId })).body as {
      woken: string[];
      detail: string;
    };

  console.log("1. Health and metadata");
  const health = await get("/api/health");
  check("GET /api/health returns ok", health.status === 200 && (health.body as { ok: boolean }).ok);
  const agent = await get("/api/agent");
  const tools = (agent.body as { tools: { name: string }[] }).tools.map((tool) => tool.name);
  check(
    "GET /api/agent reports the model and the tool catalog",
    agent.status === 200 && tools.includes("update_loop"),
    tools.join(","),
  );
  check(
    "the catalog covers both external systems",
    tools.includes("check_refund_status") && tools.includes("check_request_status"),
  );

  const world = await simulation();
  const refundCase = world.cases.find((item) => item.kind === "REFUND") as CaseSummary;
  const letterCase = world.cases.find((item) => item.kind === "DOCUMENT_REQUEST") as CaseSummary;
  check("the simulated world exposes its cases", Boolean(refundCase && letterCase));

  console.log("\n2. The owner hands over an outcome");
  const created = await post("/api/loops", { outcome: REFUND_OUTCOME });
  check("POST /api/loops returns 201", created.status === 201, `got ${created.status}`);
  const loopId = (created.body as LoopBundle).loop.id;
  const createdLoop = (created.body as LoopBundle).loop;
  check(
    "intake grounded the loop in a real external record",
    createdLoop.context.caseId === refundCase.id,
    `caseId=${String(createdLoop.context.caseId)}`,
  );
  check("intake produced completion criteria", createdLoop.completionCriteria.length >= 2);

  console.log("\n3. The agent takes ownership on its own");
  await waitFor(async () => !runtime.isRunning(loopId), "the first agent run");
  let detail = await loop(loopId);
  check(
    "the loop moved out of ACTIVE and named what it is waiting for",
    detail.loop.status === "WAITING" && Boolean(detail.loop.waitingFor),
    `status=${detail.loop.status} waitingFor=${detail.loop.waitingFor}`,
  );
  check("the agent actually called a tool", detail.runs.some((run) => run.steps.some((s) => s.type === "tool_call")));
  check(
    "the timeline records a state transition",
    detail.loop.activityLog.some((entry) => entry.kind === "STATE" && entry.transition),
  );

  const waitingOnApproval = detail.loop.waitingFor;

  console.log("\n4. A reply arrives that changes nothing");
  const replied = await act("COUNTERPARTY_RESPONDS", refundCase.id);
  check("the agent was woken by the change", (replied.woken ?? []).includes(loopId), replied.detail);
  detail = await loop(loopId);
  check(
    "a reply was not mistaken for progress",
    detail.loop.status !== "RESOLVED" && detail.loop.waitingFor === waitingOnApproval,
    `status=${detail.loop.status} waitingFor=${detail.loop.waitingFor}`,
  );
  check(
    "the agent recorded that a reply is not progress",
    detail.loop.activityLog.some(
      (entry) => entry.kind === "INTERPRETATION" && /reply/i.test(entry.summary),
    ),
  );

  console.log("\n5. The record advances to APPROVED — a promise, not a payment");
  await act("ADVANCE_ONE_STEP", refundCase.id);
  detail = await loop(loopId);
  check(
    "the agent stayed open, now waiting on the funds being released",
    detail.loop.status !== "RESOLVED" && /release|fund|payment method/i.test(detail.loop.waitingFor ?? ""),
    `status=${detail.loop.status} waitingFor=${detail.loop.waitingFor}`,
  );

  console.log("\n6. The record advances to ISSUED — released is not received");
  await act("ADVANCE_ONE_STEP", refundCase.id);
  detail = await loop(loopId);
  check(
    "the agent stayed open, now waiting on the credit itself",
    detail.loop.status !== "RESOLVED" && /credit|post/i.test(detail.loop.waitingFor ?? ""),
    `status=${detail.loop.status} waitingFor=${detail.loop.waitingFor}`,
  );

  console.log("\n7. The credit posts — the outcome is observed");
  await act("ADVANCE_ONE_STEP", refundCase.id);
  const done = await waitFor(
    async () => (await loop(loopId)).loop.status === "RESOLVED",
    "the loop to resolve",
  );
  detail = await loop(loopId);
  check("the loop reached RESOLVED", done, `status=${detail.loop.status}`);
  check("a resolution summary was written", Boolean(detail.loop.resolutionSummary));
  check("an agent run ended as RESOLVED", detail.runs.some((run) => run.outcome === "RESOLVED"));
  check(
    "the timeline shows the full arc",
    (["INVESTIGATE", "ACTION", "WAITING", "INTERPRETATION", "RESOLVED"] as const).every((kind) =>
      detail.loop.activityLog.some((entry) => entry.kind === kind),
    ),
    detail.loop.activityLog.map((entry) => entry.kind).join(","),
  );

  console.log("\n8. The loop survives a restart");
  store.flush();
  const reopened = OpenLoopStore.open(file);
  const persisted = reopened.getLoop(loopId);
  check("the loop is still there after reloading from disk", Boolean(persisted));
  check(
    "its whole activity history survived",
    (persisted?.activityLog.length ?? 0) === detail.loop.activityLog.length,
    `expected ${detail.loop.activityLog.length}, got ${persisted?.activityLog.length ?? 0}`,
  );
  check("its agent memory survived", persisted?.context.caseId === refundCase.id);

  console.log("\n9. Live event stream");
  check("run_started was streamed", events.some((event) => event.type === "run_started"));
  check("individual agent steps were streamed", events.some((event) => event.type === "step"));
  check("loop updates were streamed", events.some((event) => event.type === "loop_updated"));
  check("run_finished was streamed", events.some((event) => event.type === "run_finished"));
  check(
    "the world snapshot the UI reads carries external state only",
    world.cases.every((item) => item.status.length > 0 && item.milestones.length > 0) &&
      !Object.keys(world.cases[0] ?? {}).some((key) =>
        ["nextAction", "waitingFor", "currentState", "activityLog"].includes(key),
      ),
  );

  console.log("\n10. A second, unrelated outcome uses the same architecture");
  const letter = await post("/api/loops", { outcome: LETTER_OUTCOME });
  const letterId = (letter.body as LoopBundle).loop.id;
  check(
    "intake resolved it to the document system, not the refund system",
    (letter.body as LoopBundle).loop.context.caseId === letterCase.id,
    `caseId=${String((letter.body as LoopBundle).loop.context.caseId)}`,
  );
  await waitFor(async () => !runtime.isRunning(letterId), "the letter agent run");
  let letterDetail = await loop(letterId);
  check(
    "it is waiting on something entirely different",
    letterDetail.loop.status === "WAITING" && !/refund|credit|payment/i.test(letterDetail.loop.waitingFor ?? ""),
    `waitingFor=${letterDetail.loop.waitingFor}`,
  );

  await act("ADVANCE_ONE_STEP", letterCase.id);
  await act("ADVANCE_ONE_STEP", letterCase.id);
  letterDetail = await loop(letterId);
  check(
    "\"submitted\" was not mistaken for \"received\"",
    letterDetail.loop.status !== "RESOLVED" && /confirm|university|checklist/i.test(letterDetail.loop.waitingFor ?? ""),
    `status=${letterDetail.loop.status} waitingFor=${letterDetail.loop.waitingFor}`,
  );

  await act("ADVANCE_ONE_STEP", letterCase.id);
  const letterDone = await waitFor(
    async () => (await loop(letterId)).loop.status === "RESOLVED",
    "the letter loop to resolve",
  );
  check("the same agent resolved a completely different case", letterDone);

  console.log("\n11. Escalation path");
  const other = await post("/api/loops", {
    outcome: "Make sure the contract I sent to Northwind Legal gets signed and returned.",
  });
  const otherId = (other.body as LoopBundle).loop.id;
  await waitFor(async () => !runtime.isRunning(otherId), "the second agent run");
  const escalated = await loop(otherId);
  const escalatedStatus: LoopStatus = escalated.loop.status;
  check(
    "an outcome with no reachable record escalates instead of inventing state",
    escalatedStatus === "NEEDS_HUMAN",
    `status=${escalatedStatus} caseId=${String(escalated.loop.context.caseId)} timeline=${escalated.loop.activityLog
      .slice(-4)
      .map((entry) => entry.summary)
      .join(" | ")}`,
  );
  check("a human request was recorded", Boolean(escalated.loop.humanRequest));
  const nudged = await act("COUNTERPARTY_RESPONDS", letterCase.id);
  check(
    "a paused loop is not woken by a world change — the pause is real",
    !(nudged.woken ?? []).includes(otherId),
    `woken=${(nudged.woken ?? []).join(",")}`,
  );

  console.log("\n12. The owner answers, and the agent acts on it");
  // The blocked path again, this time carried through to resolution: escalate,
  // the owner supplies the missing detail, the agent forwards it, then verifies.
  await act("RESET_SCENARIO", letterCase.id);
  const blocked = await post("/api/loops", { outcome: LETTER_OUTCOME });
  const blockedId = (blocked.body as LoopBundle).loop.id;
  await waitFor(async () => !runtime.isRunning(blockedId), "the blocked run");
  await act("COUNTERPARTY_NEEDS_INFO", letterCase.id);
  let blockedDetail = await loop(blockedId);
  check(
    "an information blocker escalates to the owner",
    blockedDetail.loop.status === "NEEDS_HUMAN" && Boolean(blockedDetail.loop.humanRequest),
    `status=${blockedDetail.loop.status}`,
  );
  const asked = blockedDetail.loop.humanRequest?.question ?? "";

  const answer = "Applicant ID ACK-88214, portal link westbrook.edu/upload/recommendation";
  const resumed = await post(`/api/loops/${blockedId}/human-response`, { response: answer });
  check("POST /human-response accepts the answer", resumed.status === 202, `got ${resumed.status}`);
  blockedDetail = await loop(blockedId);
  check(
    "the owner's answer is recorded verbatim as loop context",
    blockedDetail.loop.context.latestOwnerResponse === answer,
    `got ${String(blockedDetail.loop.context.latestOwnerResponse)}`,
  );
  check("the outstanding request was cleared", blockedDetail.loop.humanRequest === null);
  check(
    "the agent left the paused state and did real work",
    blockedDetail.loop.status !== "NEEDS_HUMAN",
    `status=${blockedDetail.loop.status}`,
  );
  check(
    "it forwarded what the owner supplied instead of asking again",
    blockedDetail.runs.some((run) => run.steps.some((step) => step.tool === "send_email")) &&
      blockedDetail.loop.activityLog.some(
        (entry) => entry.kind === "ACTION" && entry.tool === "send_email",
      ),
    blockedDetail.loop.activityLog
      .slice(-4)
      .map((entry) => `${entry.kind}:${entry.tool ?? "-"}`)
      .join(" | "),
  );
  check(
    "it does not re-ask the same question",
    blockedDetail.loop.humanRequest === null &&
      blockedDetail.loop.activityLog.filter((entry) => entry.kind === "ESCALATION").length <= 1,
  );

  // The case is back at ACKNOWLEDGED, so: drafted, submitted, then received.
  await act("ADVANCE_ONE_STEP", letterCase.id);
  await act("ADVANCE_ONE_STEP", letterCase.id);
  await act("ADVANCE_ONE_STEP", letterCase.id);
  const resumedDone = await waitFor(
    async () => (await loop(blockedId)).loop.status === "RESOLVED",
    "the resumed loop to resolve",
  );
  check(
    "the same loop runs from escalation all the way to verified completion",
    resumedDone && !asked.includes("undefined"),
  );

  console.log("\n13. Static client");
  if (existsSync(distDir)) {
    const home = await fetch(`${base}/`);
    const homeHtml = await home.text();
    check("GET / serves the built client shell", home.status === 200 && homeHtml.includes('<div id="root">'));
    const deepLink = await fetch(`${base}/app/loops/${loopId}`);
    check("client routes deep-link correctly", deepLink.status === 200);
  } else {
    console.log("  – skipped (run `bun run build` first)");
  }

  console.log("");
  controller.abort();
  monitor.stop();
  store.flush();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} check(s) failed\n`);
    process.exitCode = 1;
  } else {
    console.log("All API checks passed.\n");
  }
}

await main();
