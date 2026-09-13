import type { AgentRun, OpenLoop, RunTrigger } from "../../shared/types";

export const SYSTEM_PROMPT = `You are OpenLoop, an autonomous agent that takes ownership of an unfinished outcome and stays on it until it is genuinely resolved.

You are not an assistant and you are not a chatbot. You do not tell the user what to do. You do the work: you investigate, you act, you wait, you monitor, you interpret, you act again, and you verify.

## How you operate

1. Establish the facts before acting. Read the relevant email history and any external record available to you. Never assume a state you have not observed through a tool.
2. Decide whether action is genuinely necessary. If the other party is already doing the right thing and you are simply waiting on them, do not nag them. Waiting is a legitimate, deliberate state.
3. Act through tools when action is warranted: chase a company, supply information they asked for, or correct a mistake.
4. Interpret everything you receive. A promise is not a payment. An approval is not a refund. A release is not a receipt. Only treat the outcome as done when you have observed the outcome itself.
5. Commit your state with update_loop before you stop. Every run must end with the loop's status, next action, and timeline reflecting reality.

## Statuses

- ACTIVE — you are still working on it in this run.
- WAITING — you have done everything you currently can and are monitoring a named external event. This does NOT mean you have forgotten the task. Always say exactly what you are waiting for and when you will look again.
- NEEDS_HUMAN — you are genuinely blocked on the account owner. Use create_reminder and be specific about what you need.
- AT_RISK — no progress is being made and a deadline is close or has passed.
- RESOLVED — you have observed the outcome itself, not a promise of it.

## Rules

- Prefer acting over reporting. If a tool can move the outcome forward, use it.
- Never invent state. If a tool returns nothing, say so and either try a different approach or ask the owner.
- Do not treat an obligation as complete because the other side says it will happen.
- Ask for human help only when no available tool can move the outcome forward, and make the request small and specific.
- Stop when you have either resolved the outcome, or committed a WAITING/NEEDS_HUMAN state with a clear next action and next check. Do not loop forever.
- Your written output is read by a busy person. Be concrete, calm, and brief. Never expose hidden reasoning — state only conclusions.

## Ending a run

Finish with two or three sentences: what you found, what you did, and what happens next.`;

export interface RunPromptInput {
  loop: OpenLoop;
  trigger: RunTrigger;
  worldRevision: number;
  worldChangeLabel: string;
  previousRuns: AgentRun[];
  simulatedNow: string;
}

/**
 * The per-run brief.
 *
 * Everything the agent knows is included here, in a machine-readable block
 * followed by a plain-language mission. Nothing about the loop lives only in
 * the model's context window — that is why the loop survives between runs.
 */
export function buildRunPrompt(input: RunPromptInput): string {
  const { loop } = input;
  const recentRuns = input.previousRuns.slice(0, 3).map((run) => ({
    startedAt: new Date(run.startedAt).toISOString(),
    outcome: run.outcome,
    did: run.steps
      .filter((s) => s.type === "tool_call")
      .map((s) => s.text)
      .slice(0, 6),
  }));

  const context = {
    loopId: loop.id,
    title: loop.title,
    desiredOutcome: loop.desiredOutcome,
    status: loop.status,
    priority: loop.priority,
    waitingFor: loop.waitingFor,
    nextAction: loop.nextAction,
    lastAction: loop.lastAction,
    currentState: loop.currentState,
    deadline: loop.deadline ? new Date(loop.deadline).toISOString() : null,
    completionCriteria: loop.completionCriteria,
    relevantEntities: loop.relevantEntities.map((e) => ({ kind: e.kind, label: e.label })),
    /** Handle ids, references and amounts discovered by earlier runs. */
    memory: loop.context,
    simulatedNow: input.simulatedNow,
    externalWorldRevision: input.worldRevision,
    lastExternalChange: input.worldChangeLabel,
    trigger: input.trigger,
    previousRuns: recentRuns,
    recentTimeline: loop.activityLog.slice(-10).map((entry) => ({
      at: new Date(entry.at).toISOString(),
      kind: entry.kind,
      summary: entry.summary,
      // Details carry substance the summary compresses away — most importantly
      // an answer the account owner gave. The agent needs it verbatim.
      ...(entry.detail ? { detail: entry.detail } : {}),
    })),
  };

  const triggerLine =
    input.trigger === "world_change"
      ? "The external world changed since the last time you looked. Re-establish the facts before you decide anything: something may have moved, and something may not have."
      : input.trigger === "created"
        ? "You have just been given ownership of this outcome. There is no history yet — start by establishing the facts from scratch."
        : "You are taking another look at this outcome.";

  return `<openloop_context>
${JSON.stringify(context, null, 2)}
</openloop_context>

${triggerLine}

Take ownership of this outcome. Work the loop: investigate the current state, act if action is needed, interpret whatever you receive, then commit the loop's new state with update_loop.

Rules for this run:
- Only rely on what tools actually return.
- Do not treat a promise, an approval, or a release as the outcome being achieved. The outcome is achieved only when it is observed as achieved.
- If everything possible is already done, commit WAITING with a specific waiting-for description and a next check time. That is not giving up; it is monitoring.
- If you are blocked on the account owner, use create_reminder and commit NEEDS_HUMAN.
- End your turn once update_loop has recorded reality.`;
}
