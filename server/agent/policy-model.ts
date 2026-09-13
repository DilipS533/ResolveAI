import { Model } from "@strands-agents/sdk";
import type { BaseModelConfig, Message, ModelStreamEvent, StreamOptions } from "@strands-agents/sdk";
import { randomUUID } from "node:crypto";
import type { ActivityKind } from "../../shared/types";

/**
 * A deterministic Strands model provider.
 *
 * OpenLoop runs on the real Strands agent loop: messages in, tool specs, tool
 * calls out, tool results fed back in, repeat. What changes between providers
 * is only *who decides the next move*. When AWS Bedrock credentials (or an
 * OpenAI/Anthropic key) are present, a hosted LLM decides. When they are not —
 * a laptop, a hackathon demo, CI — this policy engine decides.
 *
 * Critically, this is not a script of the demo. It has no knowledge of refunds,
 * merchants, or Acme. It reads the normalized `CaseView` that the inspection
 * tools return and reasons about it purely in terms of:
 *
 *   status vs completeStatus   is the outcome observed, or only promised?
 *   isOverdue / daysOverdue    is chasing warranted, or would it achieve nothing?
 *   informationRequest         is this blocked on a human?
 *   hasNewResponse             did the outside world actually move?
 *
 * Give it a different external world and it reaches different conclusions,
 * including resolving without ever sending an email.
 */

type Decision =
  | { kind: "tool"; name: string; input: Record<string, unknown> }
  | { kind: "final"; text: string };

interface Observation {
  name: string;
  input: Record<string, unknown>;
  ok: boolean;
  data: unknown;
}

interface PromptContext {
  loopId?: string;
  title?: string;
  desiredOutcome?: string;
  status?: string;
  memory?: Record<string, unknown>;
  simulatedNow?: string;
}

/** Inspection tools, in fallback priority order. */
const INSPECTION_TOOLS = ["check_refund_status", "check_request_status"] as const;

const KIND_TO_TOOL: Record<string, string> = {
  REFUND: "check_refund_status",
  DOCUMENT_REQUEST: "check_request_status",
};

const MS_DAY = 86400000;

/* ------------------------------------------------------------------ *
 * Reading the conversation
 * ------------------------------------------------------------------ */

function blockType(block: unknown): string | undefined {
  const value = block as Record<string, unknown> | null;
  if (!value) return undefined;
  if (typeof value.type === "string") return value.type;
  if ("toolUse" in value) return "toolUseBlock";
  if ("toolResult" in value) return "toolResultBlock";
  if ("text" in value) return "textBlock";
  return undefined;
}

function unwrap(block: unknown, key: string): Record<string, unknown> {
  const value = block as Record<string, unknown>;
  const nested = value[key];
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return value;
}

function readToolResultContent(content: unknown): unknown {
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    const record = part as Record<string, unknown>;
    if (record && typeof record === "object" && "json" in record) return record.json;
  }
  const texts = content
    .map((part) => (part as Record<string, unknown>)?.text)
    .filter((text): text is string => typeof text === "string");
  return texts.length > 0 ? texts.join("\n") : null;
}

export function messageText(message: Message): string {
  return message.content
    .filter((block) => blockType(block) === "textBlock")
    .map((block) => unwrap(block, "text").text)
    .filter((text): text is string => typeof text === "string")
    .join("\n")
    .trim();
}

function extractObservations(messages: Message[]): Observation[] {
  const uses = new Map<string, { name: string; input: Record<string, unknown> }>();
  for (const message of messages) {
    for (const block of message.content) {
      if (blockType(block) !== "toolUseBlock") continue;
      const use = unwrap(block, "toolUse");
      const toolUseId = String(use.toolUseId ?? "");
      if (!toolUseId) continue;
      uses.set(toolUseId, {
        name: String(use.name ?? ""),
        input: (use.input as Record<string, unknown>) ?? {},
      });
    }
  }

  const observations: Observation[] = [];
  for (const message of messages) {
    for (const block of message.content) {
      if (blockType(block) !== "toolResultBlock") continue;
      const result = unwrap(block, "toolResult");
      const use = uses.get(String(result.toolUseId ?? ""));
      if (!use) continue;
      observations.push({
        name: use.name,
        input: use.input,
        ok: result.status !== "error",
        data: readToolResultContent(result.content),
      });
    }
  }
  return observations;
}

function extractPromptContext(messages: Message[]): PromptContext {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const match = messageText(message).match(/<openloop_context>([\s\S]*?)<\/openloop_context>/);
    if (!match) continue;
    try {
      return JSON.parse(match[1]) as PromptContext;
    } catch {
      return {};
    }
  }
  return {};
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readable(status: string | undefined): string {
  return (status ?? "").replace(/_/g, " ").toLowerCase();
}

function longDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toDateString();
}

/** The state the outside world is in, as reported by the inspection tools. */
interface CaseReading {
  view: Record<string, unknown>;
  counterpartyName: string;
  counterpartyAddress?: string;
  reference?: string;
  status?: string;
  completeStatus?: string;
  isComplete: boolean;
  isOverdue: boolean;
  daysOverdue: number;
  nextStep?: string;
  informationRequest?: string;
  subject: string;
  note?: string;
}

function readCase(view: Record<string, unknown>, memory: Record<string, unknown>): CaseReading {
  const counterparty = asRecord(view.counterparty);
  const status = asString(view.status);
  const completeStatus = asString(view.completeStatus);
  return {
    view,
    counterpartyName:
      asString(counterparty?.name) ??
      asString(memory.counterpartyName) ??
      asString(memory.counterparty) ??
      "the other party",
    counterpartyAddress: asString(counterparty?.address) ?? asString(memory.counterparty),
    reference: asString(view.reference) ?? asString(memory.reference),
    status,
    completeStatus,
    isComplete: view.isComplete === true || (Boolean(status) && status === completeStatus),
    isOverdue: view.isOverdue === true,
    daysOverdue: asNumber(view.daysOverdue) ?? 0,
    nextStep: asString(view.nextStep),
    informationRequest: asString(view.informationRequest),
    subject: asString(view.subject) ?? asString(view.title) ?? "this outcome",
    note: asString(view.note) ?? asString(view.statusMeaning),
  };
}

/* ------------------------------------------------------------------ *
 * The decision procedure
 * ------------------------------------------------------------------ */

function decide(messages: Message[], options?: StreamOptions): Decision {
  const context = extractPromptContext(messages);
  const observations = extractObservations(messages);
  const memory = asRecord(context.memory) ?? {};
  const available = new Set((options?.toolSpecs ?? []).map((spec) => spec.name));
  const has = (name: string) => available.size === 0 || available.has(name);

  const called = (name: string) => observations.some((observation) => observation.name === name);
  const last = (name: string) => [...observations].reverse().find((observation) => observation.name === name);
  const lastObservation = observations[observations.length - 1];
  const now = context.simulatedNow ? Date.parse(context.simulatedNow) : Date.now();

  const counterpartyAddress = asString(memory.counterparty);
  const counterpartyName = asString(memory.counterpartyName) ?? counterpartyAddress;
  const reference = asString(memory.reference);
  const caseKind = asString(memory.caseKind);
  const outcomeTitle = context.title ?? "this outcome";

  /* 1 — Establish the paper trail before doing anything else. */
  if (!called("search_email") && has("search_email")) {
    return {
      kind: "tool",
      name: "search_email",
      input: { query: reference ?? counterpartyName ?? inferSearchTerm(context.desiredOutcome), limit: 10 },
    };
  }

  /* 2 — Read the external record. Intake usually resolves the loop to a
   *     specific system; when it cannot, try each system in turn. */
  const inspectionTools = INSPECTION_TOOLS.filter(has);
  const preferred = caseKind ? KIND_TO_TOOL[caseKind] : undefined;
  const candidates = preferred && has(preferred) ? [preferred] : [...inspectionTools];

  const externalCheck = asRecord(last("check_external_response")?.data);
  const externalHadNews = externalCheck?.hasNewResponse === true;
  const lastWasInspection = lastObservation ? candidates.includes(lastObservation.name) : false;
  const externalCheckWasSilent = lastObservation?.name === "check_external_response" && !externalHadNews;
  const inspectionResults = candidates
    .map((name) => asRecord(last(name)?.data))
    .filter((data): data is Record<string, unknown> => Boolean(data));
  const foundAny = inspectionResults.some((data) => data.found === true);

  if (candidates.length > 0) {
    // Ask a system we have not asked yet, when nothing has been found.
    const untried = candidates.filter((name) => !called(name));
    if (!foundAny && untried.length > 0) {
      return { kind: "tool", name: untried[0], input: { handle: reference ?? counterpartyName } };
    }

    // Otherwise re-read the record whenever something new has happened: a
    // chase we sent, a reply that arrived, or the very first read of the run.
    const shouldReRead =
      Boolean(lastObservation) &&
      lastObservation!.name !== "update_loop" &&
      lastObservation!.name !== "create_reminder" &&
      !lastWasInspection &&
      !externalCheckWasSilent;

    if (shouldReRead) {
      return { kind: "tool", name: candidates[0], input: { handle: reference ?? counterpartyName } };
    }
  }

  /* 3 — A commit already happened this run and nothing has moved since, so
   *     there is no reason to keep spinning. Stop. */
  const lastCommitIndex = observations.map((observation) => observation.name).lastIndexOf("update_loop");
  if (lastCommitIndex >= 0) {
    const madeProgressAfterCommit = observations.slice(lastCommitIndex + 1).some(
      (observation) =>
        observation.name === "send_email" ||
        (INSPECTION_TOOLS as readonly string[]).includes(observation.name) ||
        (observation.name === "check_external_response" &&
          asRecord(observation.data)?.hasNewResponse === true),
    );
    if (!madeProgressAfterCommit) {
      return { kind: "final", text: closingSummary(observations, memory, outcomeTitle) };
    }
  }

  /* 4 — Interpret the record. */
  const found = inspectionResults.find((data) => data.found === true);

  if (!found) {
    // Every connected system was asked and none of them recognises this
    // outcome, so guessing would be worse than asking.
    const exhausted = candidates.length > 0 && candidates.every((name) => called(name));
    if (exhausted) {
      if (!called("create_reminder") && has("create_reminder")) {
        return {
          kind: "tool",
          name: "create_reminder",
          input: {
            question: `Which company or organisation should OpenLoop chase for “${outcomeTitle}”?`,
            reason:
              "OpenLoop searched the mailbox and every connected record and could not find the request behind this outcome.",
          },
        };
      }
      return {
        kind: "final",
        text: `I couldn't find a record of this outcome in your mailbox or in any connected system, so I've paused the loop and asked you for the company or reference behind it. As soon as you tell me, I'll pick it straight back up.`,
      };
    }
    return commitWaiting({
      context,
      observations,
      memory,
      reading: undefined,
      counterpartyName: counterpartyName ?? "the other party",
      counterpartyAddress,
      reference,
      outcomeTitle,
      now,
      externalHadNews,
    });
  }

  const reading = readCase(found, memory);

  /* --- The other side is waiting on something only the account owner has. --- */
  if (reading.informationRequest) {
    const request = reading.informationRequest;
    const ownerAnswer = asString(memory.latestOwnerResponse);
    const suppliedAlready = Boolean(ownerAnswer && asString(memory.forwardedOwnerResponse) === ownerAnswer);
    const suppliedThisRun = observations.some((observation) => observation.name === "send_email");

    // The owner has already told us what was asked for, so there is nothing
    // left to escalate — the thing to do is supply it and let the record move.
    if (
      ownerAnswer &&
      !suppliedAlready &&
      !suppliedThisRun &&
      reading.counterpartyAddress &&
      has("send_email")
    ) {
      return {
        kind: "tool",
        name: "send_email",
        input: {
          to: reading.counterpartyAddress,
          toName: reading.counterpartyName,
          subject: `${reading.reference ? `${reading.reference} — ` : ""}the information you asked for`,
          purpose: `Supply the information ${reading.counterpartyName} asked for so ${reading.subject} can move`,
          body: [
            `Hi ${reading.counterpartyName},`,
            "",
            `You asked for: ${request}`,
            "",
            "Here it is:",
            ownerAnswer,
            "",
            `Please go ahead with ${reading.subject} now that you have this.`,
            "",
            "Thanks,",
            "Jordan",
          ].join("\n"),
        },
      };
    }

    // Already supplied: stop asking and watch the record instead. Asking the
    // owner the same question twice is the failure mode this branch prevents.
    if (suppliedAlready || suppliedThisRun) {
      return commitWaiting({
        context,
        observations,
        memory,
        reading,
        counterpartyName: reading.counterpartyName,
        counterpartyAddress: reading.counterpartyAddress,
        reference: reading.reference,
        outcomeTitle,
        now,
        externalHadNews,
      });
    }

    if (!called("create_reminder") && has("create_reminder")) {
      return {
        kind: "tool",
        name: "create_reminder",
        input: {
          question: request,
          reason: `${reading.counterpartyName} says it cannot proceed with ${reading.subject} without this, and it is not something OpenLoop can produce on your behalf.`,
        },
      };
    }
    return {
      kind: "final",
      text: `${reading.counterpartyName} can't move ${reading.subject} forward until it has something only you can provide: ${request} I've paused the loop and put that request in front of you — reply with it and I'll send it straight back and keep chasing.`,
    };
  }

  /* --- The outcome is observed. Verify it, then resolve. --- */
  if (reading.isComplete) {
    const confirmations = observations.filter((observation) => observation.name === "search_email");
    const alreadyLookedForConfirmation = confirmations.some((observation) =>
      String(observation.input.query ?? "").toLowerCase().includes("confirm"),
    );
    if (has("search_email") && !alreadyLookedForConfirmation && !called("update_loop")) {
      return { kind: "tool", name: "search_email", input: { query: "confirm received", limit: 5 } };
    }
    if (!called("update_loop") && has("update_loop")) {
      return {
        kind: "tool",
        name: "update_loop",
        input: {
          notes: `${reading.note ?? `${reading.counterpartyName} confirms ${reading.subject} is done.`} The outcome is achieved, not merely promised.`,
          status: "RESOLVED",
          currentState: `${capitalise(reading.subject)} is complete. Nothing further is outstanding.`,
          lastAction: "Verified the outcome in the external record and the confirmation it produced",
          nextAction: "None — the outcome is resolved",
          clearWaitingFor: true,
          clearNextCheck: true,
          priority: "NORMAL",
          completionCriteria: criteriaFor(reading),
          relevantEntities: entitiesFor(reading),
          context: memoryPatch(reading, observations, context),
          resolutionSummary: `${reading.counterpartyName} completed ${reading.subject}${
            reading.reference && !reading.subject.includes(reading.reference)
              ? ` (${reading.reference})`
              : ""
          }. OpenLoop confirmed it in the external record — the status moved to ${readable(
            reading.completeStatus,
          )}${reading.note ? `, and ${lowerFirst(reading.note.replace(/\.\s*$/, ""))}` : ""} — rather than accepting ${reading.counterpartyName}'s word for it.`,
          activity: [
            {
              kind: "OBSERVATION",
              summary: `The external record shows ${reading.counterpartyName} has completed ${reading.subject}`,
            },
            {
              kind: "INTERPRETATION",
              summary: `Checked the confirmation before concluding: the record is at ${readable(
                reading.completeStatus,
              )}, which is the outcome itself — not a promise of it.`,
            },
          ],
        },
      };
    }
    return {
      kind: "final",
      text: `Done. ${reading.counterpartyName} has completed ${reading.subject}, and I confirmed it in the external record before closing the loop. Nothing further is outstanding.`,
    };
  }

  /* --- Not complete. Decide whether chasing is warranted. --- */
  const chaseAlreadySent = called("send_email");
  const followUps = asNumber(memory.followUps) ?? 0;
  const lastFollowUpAt = memory.lastFollowUpAt ? Date.parse(String(memory.lastFollowUpAt)) : Number.NaN;
  const daysSinceFollowUp = Number.isNaN(lastFollowUpAt) ? Infinity : (now - lastFollowUpAt) / MS_DAY;
  const shouldChase = !chaseAlreadySent && followUps < 3 && daysSinceFollowUp >= 3;
  const dueLabel = longDate(asString(reading.view.dueBy));

  if (reading.isOverdue && shouldChase && has("send_email") && reading.counterpartyAddress) {
    return {
      kind: "tool",
      name: "send_email",
      input: {
        to: reading.counterpartyAddress,
        toName: reading.counterpartyName,
        subject: `${reading.reference ? `${reading.reference} — ` : ""}still outstanding: ${reading.subject}`,
        purpose: `Chase ${reading.subject}, which is ${reading.daysOverdue} days overdue`,
        body: [
          `Hi ${reading.counterpartyName},`,
          "",
          `I'm following up on ${reading.subject}${reading.reference ? ` (${reading.reference})` : ""}.`,
          "",
          `Your record shows: ${reading.note ?? "no progress"}`,
          "",
          `Waiting on: ${reading.nextStep ?? "your next action"}. That was expected by ${
            dueLabel ?? "the date you quoted"
          }, and it is now ${reading.daysOverdue} days past it.`,
          "",
          "Could you tell me where this actually stands, and give me a specific date rather than a restatement of the policy?",
          "",
          "Thanks,",
          "Jordan",
        ].join("\n"),
      },
    };
  }

  // Ask whether a reply arrived at most once per outbound message. A reply is
  // not progress, and re-polling a mailbox that still holds the same unread
  // reply would spin forever, so the probe is only repeated after we have
  // actually said something new ourselves.
  const lastExternalCheck = observations.map((o) => o.name).lastIndexOf("check_external_response");
  const chasedSinceCheck = observations
    .slice(lastExternalCheck + 1)
    .some((observation) => observation.name === "send_email");
  const shouldPollForReply =
    has("check_external_response") &&
    !externalCheckWasSilent &&
    (lastExternalCheck < 0 || chasedSinceCheck);

  if (shouldPollForReply) {
    return {
      kind: "tool",
      name: "check_external_response",
      input: { ...(reading.counterpartyAddress ? { from: reading.counterpartyAddress } : {}) },
    };
  }

  return commitWaiting({
    context,
    observations,
    memory,
    reading,
    counterpartyName: reading.counterpartyName,
    counterpartyAddress: reading.counterpartyAddress,
    reference: reading.reference,
    outcomeTitle,
    now,
    externalHadNews,
  });
}

/* ------------------------------------------------------------------ *
 * Committing a waiting / at-risk state
 * ------------------------------------------------------------------ */

interface CommitInput {
  context: PromptContext;
  observations: Observation[];
  memory: Record<string, unknown>;
  reading: CaseReading | undefined;
  counterpartyName: string;
  counterpartyAddress?: string;
  reference?: string;
  outcomeTitle: string;
  now: number;
  externalHadNews: boolean;
}

function commitWaiting(input: CommitInput): Decision {
  const { reading, memory, observations, context, counterpartyName } = input;

  if (!reading) {
    // No usable external record, but we did find correspondence. Wait and re-check
    // rather than guessing at a state we could not observe.
    const waited = asNumber(memory.waits) ?? 0;
    if (waited >= 2) {
      // Repeated monitoring has not made the outcome observable, and no tool can
      // create that record. That is a genuine dead end, so it goes to the owner.
      if (!observations.some((observation) => observation.name === "create_reminder")) {
        return {
          kind: "tool",
          name: "create_reminder",
          input: {
            question: `Which company, reference, or account is “${input.outcomeTitle}” about?`,
            reason:
              "OpenLoop searched the mailbox and every connected system and could not find a record it can inspect, so it cannot verify anything about this outcome without that detail.",
          },
        };
      }
      return {
        kind: "final",
        text: `I can see correspondence about “${input.outcomeTitle}” but no external record I can inspect, so I've paused the loop and asked you which company or reference it is about. Once you tell me, I can verify it properly instead of guessing.`,
      };
    }
    return {
      kind: "tool",
      name: "update_loop",
      input: {
        notes: `Found correspondence about “${input.outcomeTitle}” but no external record to inspect. Recording what is known and waiting for the situation to become observable.`,
        status: "WAITING",
        waitingFor: `${capitalise(input.outcomeTitle)} to become observable in a record OpenLoop can read`,
        currentState: `OpenLoop has the correspondence but cannot yet verify the state of this outcome outside email.`,
        nextAction: "Re-read the available records and look for a reference to verify against",
        lastAction: "Searched the mailbox and the connected records",
        nextCheckInHours: 24,
        context: { waits: waited + 1 },
        activity: [
          {
            kind: "INTERPRETATION",
            summary:
              "There is no inspectable record for this outcome yet, so OpenLoop is monitoring rather than acting blind.",
          },
        ],
      },
    };
  }

  const chaseSent = observations.some((observation) => observation.name === "send_email");
  const overdue = reading.isOverdue;
  const lastFollowUpAt = memory.lastFollowUpAt ? Date.parse(String(memory.lastFollowUpAt)) : Number.NaN;
  const daysSinceFollowUp = Number.isNaN(lastFollowUpAt)
    ? Infinity
    : (input.now - lastFollowUpAt) / MS_DAY;
  // "At risk" has to mean something specific: we already chased, the case is
  // well past its date, and either the counterparty replied without moving the
  // record or the silence has itself become the signal. A chase sent moments
  // ago is simply not an at-risk situation yet.
  const needsEscalation =
    overdue &&
    reading.daysOverdue >= 7 &&
    (asNumber(memory.followUps) ?? 0) >= 1 &&
    (input.externalHadNews || daysSinceFollowUp >= 4);

  const status = needsEscalation ? "AT_RISK" : "WAITING";
  // The blocked-on event is named exactly as the external record names it, so
  // a step owned by a third party is not misattributed to the counterparty.
  const waitingFor = reading.nextStep
    ? capitalise(reading.nextStep)
    : `${reading.counterpartyName} to move ${reading.subject} forward`;

  const replyClause = input.externalHadNews
    ? ` ${reading.counterpartyName} did reply, but a reply is not progress.`
    : "";

  const notes = overdue
    ? reading.nextStep
      ? `${capitalise(reading.subject)} is ${reading.daysOverdue} days past the date ${reading.counterpartyName} quoted, and the record still says it is waiting for ${reading.nextStep}.${replyClause}`
      : `${reading.subject} is overdue at ${reading.counterpartyName}. Nothing has moved, so the loop stays open.`
    : reading.nextStep
      ? `Nothing is late yet: the record is waiting for ${reading.nextStep}, and the quoted window has not closed. Chasing now would achieve nothing, so OpenLoop is monitoring instead.`
      : `Waiting on ${reading.counterpartyName} to move ${reading.subject} forward.`;

  const activity: { kind: ActivityKind; summary: string }[] = [
    {
      kind: "OBSERVATION",
      summary: `Record read: ${reading.subject} is at ${readable(reading.status)}`,
    },
  ];
  if (reading.nextStep) {
    activity.push({
      kind: "INTERPRETATION",
      summary: `The record says it is waiting for ${reading.nextStep}. Watching for that event rather than acting on ${reading.counterpartyName}'s word.`,
    });
  }
  if (input.externalHadNews) {
    activity.push({
      kind: "INTERPRETATION",
      summary: `${counterpartyName} replied, but the record has not moved — a reply is not progress.`,
    });
  }
  if (needsEscalation) {
    activity.push({
      kind: "INTERPRETATION",
      summary: `This has now been outstanding for ${reading.daysOverdue} days with no movement, so the loop is flagged as at risk.`,
    });
  }

  return {
    kind: "tool",
    name: "update_loop",
    input: {
      notes,
      status,
      waitingFor,
      currentState: reading.note ?? `Waiting on ${reading.counterpartyName}.`,
      nextAction: chaseSent
        ? `Watch for ${reading.counterpartyName}'s reply, then re-read the record`
        : `Re-read the record and confirm whether ${reading.nextStep ?? "anything has changed"}`,
      lastAction: chaseSent
        ? `Followed up with ${reading.counterpartyName} and re-read the record`
        : `Read the record and established exactly what is outstanding`,
      nextCheckInHours: overdue ? 24 : 72,
      priority: reading.daysOverdue >= 7 ? "URGENT" : "HIGH",
      completionCriteria: criteriaFor(reading),
      relevantEntities: entitiesFor(reading),
      context: memoryPatch(reading, observations, context),
      activity,
    },
  };
}

/**
 * Everything the agent wants to remember about this outcome. Persisting the
 * case id, its state machine and its target state is what lets a later run —
 * possibly after a process restart — resume without re-discovering anything.
 */
function memoryPatch(reading: CaseReading, observations: Observation[], context: PromptContext): Record<string, unknown> {
  const prior = asRecord(context.memory) ?? {};
  const followUpsSent = observations.some((observation) => observation.name === "send_email");
  const threadId = asString(asRecord([...observations].reverse().find((o) => o.name === "send_email")?.data)?.threadId);
  const facts = asRecord(reading.view.facts) ?? {};
  const ownerAnswer = asString(prior.latestOwnerResponse);
  const sentSomething = observations.some((observation) => observation.name === "send_email");

  return {
    caseId: asString(reading.view.caseId) ?? asString(prior.caseId) ?? null,
    caseKind: asString(reading.view.kind) ?? asString(prior.caseKind) ?? null,
    counterparty: reading.counterpartyAddress ?? null,
    counterpartyName: reading.counterpartyName,
    reference: reading.reference ?? null,
    status: reading.status ?? null,
    completeStatus: reading.completeStatus ?? null,
    dueBy: asString(reading.view.dueBy) ?? null,
    subject: reading.subject,
    ...(threadId ? { watchThreadId: threadId } : {}),
    ...(followUpsSent
      ? {
          followUps: (asNumber(prior.followUps) ?? 0) + 1,
          lastFollowUpAt: context.simulatedNow ?? new Date().toISOString(),
        }
      : {}),
    // Remember that the owner's answer has been passed on, so the agent never
    // asks the same question twice.
    ...(sentSomething && ownerAnswer ? { forwardedOwnerResponse: ownerAnswer } : {}),
    ...Object.fromEntries(
      Object.entries(facts).filter(([, value]) => value !== null && value !== undefined),
    ),
  };
}

function criteriaFor(reading: CaseReading): string[] {
  return [
    `${reading.counterpartyName} acknowledges the request and states what happens next`,
    `The record moves to ${readable(reading.completeStatus)}`,
    `That final state is observed in the external record — not merely reported by ${reading.counterpartyName}`,
  ];
}

function entitiesFor(reading: CaseReading) {
  const kind = reading.view.kind === "REFUND" ? "COMPANY" : "PERSON";
  return [
    {
      kind: kind as "COMPANY" | "PERSON",
      label: reading.counterpartyName,
      ...(reading.counterpartyAddress ? { detail: reading.counterpartyAddress } : {}),
    },
    ...(reading.reference
      ? [
          {
            kind: (reading.view.kind === "REFUND" ? "ORDER" : "DOCUMENT") as "ORDER" | "DOCUMENT",
            label: reading.reference,
            detail: asString(reading.view.title),
          },
        ]
      : []),
    {
      kind: "SYSTEM" as const,
      label: `Target state: ${readable(reading.completeStatus)}`,
      detail: "What has to be true for OpenLoop to close this loop",
    },
  ];
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * The run's closing sentence, written from what actually happened in this run
 * — not from a template of the demo. It is read by a busy person, so it states
 * only the conclusion: what was found, what was done, and what happens next.
 */
function closingSummary(
  observations: Observation[],
  memory: Record<string, unknown>,
  outcomeTitle: string,
): string {
  const chased = observations.some((observation) => observation.name === "send_email");
  const escalated = observations.some((observation) => observation.name === "create_reminder");
  const subject = asString(memory.subject) ?? outcomeTitle;
  const counterparty = asString(memory.counterpartyName) ?? "the other party";
  const status = asString(memory.status);
  const isAt = status ? ` is at ${readable(status)}` : " has not moved";

  if (escalated) {
    return `I couldn't move ${subject} any further without you: ${counterparty} needs something only you can provide. I've put that in front of you and paused the loop rather than guessing.`;
  }
  if (chased) {
    return `I read the record for ${subject}, followed up with ${counterparty}, and re-read the record afterwards. It${isAt}, so nothing is waiting on me — the loop is committed and OpenLoop is monitoring.`;
  }
  return `I read the record for ${subject} and committed where it stands. It${isAt}, and nothing can move it from my side right now, so OpenLoop is monitoring rather than acting for its own sake.`;
}

/** Fall back to a sensible search term when nothing else identifies the case. */
function inferSearchTerm(outcome: string | undefined): string {
  if (!outcome) return "request";
  const match = outcome.match(/\b(?:from|at|with|to)\s+([A-Z][A-Za-z0-9&'’.-]*)/);
  return match?.[1] ?? outcome.split(/\s+/).slice(0, 3).join(" ");
}

/* ------------------------------------------------------------------ *
 * Model provider
 * ------------------------------------------------------------------ */

export class PolicyModel extends Model<BaseModelConfig> {
  private config: BaseModelConfig = {
    modelId: "openloop/policy-1",
    temperature: 0,
    contextWindowLimit: 200000,
  };

  updateConfig(modelConfig: BaseModelConfig): void {
    this.config = { ...this.config, ...modelConfig };
  }

  getConfig(): BaseModelConfig {
    return this.config;
  }

  async *stream(
    messages: Message[],
    options?: StreamOptions,
  ): AsyncGenerator<ModelStreamEvent, void, undefined> {
    let decision: Decision;
    try {
      decision = decide(messages, options);
    } catch (error) {
      decision = {
        kind: "final",
        text: `OpenLoop's policy engine hit an unexpected error while planning its next move: ${
          error instanceof Error ? error.message : String(error)
        }. No state was changed.`,
      };
    }

    if (decision.kind === "tool" && (options?.toolSpecs ?? []).some((spec) => spec.name === decision.name)) {
      yield* this.toolCall(decision.name, decision.input);
    } else if (decision.kind === "tool") {
      yield* this.text(
        `Tried to use the ${decision.name} tool, but it is not available in this environment. No state was changed.`,
      );
    } else {
      yield* this.text(decision.text);
    }
  }

  private *text(text: string): Generator<ModelStreamEvent, void, undefined> {
    const start: ModelStreamEvent = { type: "modelMessageStartEvent", role: "assistant" };
    yield start;
    const blockStart: ModelStreamEvent = { type: "modelContentBlockStartEvent" };
    yield blockStart;
    const delta: ModelStreamEvent = {
      type: "modelContentBlockDeltaEvent",
      delta: { type: "textDelta", text },
    };
    yield delta;
    const blockStop: ModelStreamEvent = { type: "modelContentBlockStopEvent" };
    yield blockStop;
    const stop: ModelStreamEvent = { type: "modelMessageStopEvent", stopReason: "endTurn" };
    yield stop;
  }

  private *toolCall(name: string, input: Record<string, unknown>): Generator<ModelStreamEvent, void, undefined> {
    const toolUseId = `toolu_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const start: ModelStreamEvent = { type: "modelMessageStartEvent", role: "assistant" };
    yield start;
    const blockStart: ModelStreamEvent = {
      type: "modelContentBlockStartEvent",
      start: { type: "toolUseStart", name, toolUseId },
    };
    yield blockStart;
    const delta: ModelStreamEvent = {
      type: "modelContentBlockDeltaEvent",
      delta: { type: "toolUseInputDelta", input: JSON.stringify(input) },
    };
    yield delta;
    const blockStop: ModelStreamEvent = { type: "modelContentBlockStopEvent" };
    yield blockStop;
    const stop: ModelStreamEvent = { type: "modelMessageStopEvent", stopReason: "toolUse" };
    yield stop;
  }
}
