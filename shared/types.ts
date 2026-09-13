/**
 * OpenLoop domain model.
 *
 * Shared by the agent backend, the simulated external environment, and the
 * React client. Keep this file free of runtime dependencies — it is the
 * contract between all three layers.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/* ------------------------------------------------------------------ *
 * Open loops
 * ------------------------------------------------------------------ */

export const LOOP_STATUSES = ["ACTIVE", "WAITING", "NEEDS_HUMAN", "AT_RISK", "RESOLVED"] as const;

/**
 * ACTIVE       the agent is working the loop right now
 * WAITING      everything possible is done; the agent is monitoring for the
 *              next external state change (it has NOT forgotten)
 * NEEDS_HUMAN  the agent hit a decision it genuinely cannot make alone
 * AT_RISK      no progress and a deadline is close or passed
 * RESOLVED     the desired outcome has been verified
 */
export type LoopStatus = (typeof LOOP_STATUSES)[number];

export const LOOP_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type LoopPriority = (typeof LOOP_PRIORITIES)[number];

export const ACTIVITY_KINDS = [
  "CREATED",
  "INVESTIGATE",
  "ACTION",
  "OBSERVATION",
  "INTERPRETATION",
  "STATE",
  "WAITING",
  "ESCALATION",
  "RESOLVED",
  "ERROR",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ENTITY_KINDS = [
  "COMPANY",
  "PERSON",
  "ORDER",
  "PAYMENT",
  "DOCUMENT",
  "ACCOUNT",
  "SYSTEM",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface ActivityEvent {
  id: string;
  /** epoch milliseconds */
  at: number;
  kind: ActivityKind;
  /** Concise, user-facing summary. No hidden chain-of-thought. */
  summary: string;
  detail?: string;
  /** Name of the tool that produced this event, when applicable. */
  tool?: string;
  /** Populated for kind === "STATE": the transition that happened. */
  transition?: { from: LoopStatus | null; to: LoopStatus };
}

/** Backwards-compatible alias. */
export type ActivityEntry = ActivityEvent;

export interface RelevantEntity {
  id: string;
  kind: EntityKind;
  label: string;
  detail?: string;
}

export interface HumanRequest {
  id: string;
  question: string;
  /** Why the agent cannot resolve this alone. */
  reason: string;
  createdAt: number;
}

/**
 * Agent-owned memory about the loop. Values are deliberately loose so tools
 * can persist whatever handles they discover (case ids, thread ids, ...)
 * without a schema migration.
 */
export type LoopContext = Record<string, JsonValue>;

export interface OpenLoop {
  id: string;
  title: string;
  /** The outcome the user asked for, in their own words. */
  desiredOutcome: string;
  /** Agent-authored description of the situation. */
  description: string;
  status: LoopStatus;
  priority: LoopPriority;

  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;

  /** Plain-language: what the agent will do next. */
  nextAction: string | null;
  /** Plain-language: the last thing the agent actually did. */
  lastAction: string | null;
  /** Plain-language: the external event the agent is blocked on. */
  waitingFor: string | null;
  /** Plain-language: what is happening right now. */
  currentState: string | null;

  deadline: number | null;
  nextCheckAt: number | null;

  activityLog: ActivityEvent[];
  relevantEntities: RelevantEntity[];
  completionCriteria: string[];

  /** Agent-owned memory (case ids, references, amounts, ...). */
  context: LoopContext;

  /** Set when status is NEEDS_HUMAN. */
  humanRequest: HumanRequest | null;

  /** One-paragraph summary written when the loop resolved. */
  resolutionSummary: string | null;

  runCount: number;
  lastRunAt: number | null;

  /**
   * The external world revision this loop was last looked at. The monitor
   * compares it against the world's current revision to decide whether
   * something happened that the agent has not yet seen.
   */
  lastObservedRevision: number;
}

/* ------------------------------------------------------------------ *
 * Agent runs
 * ------------------------------------------------------------------ */

export type RunOutcome =
  | "IN_PROGRESS"
  | "UPDATED"
  | "WAITING"
  | "NEEDS_HUMAN"
  | "AT_RISK"
  | "RESOLVED"
  | "ERROR";

/** The concrete event types the runtime records, mirroring the agent loop. */
export type RunStepType = "tool_call" | "tool_result" | "thought" | "final" | "state";

export interface RunStep {
  id: string;
  at: number;
  type: RunStepType;
  /** Concise, user-facing summary. */
  text: string;
  tool?: string;
  ok?: boolean;
}

export interface AgentRun {
  id: string;
  loopId: string;
  startedAt: number;
  finishedAt: number | null;
  /** e.g. "policy/openloop-policy-1" or "bedrock/global.anthropic.claude-sonnet-4-6" */
  model: string;
  outcome: RunOutcome;
  /** Whether a human pressed "Run agent now" or the monitor noticed a change. */
  trigger: RunTrigger;
  steps: RunStep[];
  error: string | null;
}

export type RunTrigger = "manual" | "created" | "world_change" | "schedule";

/* ------------------------------------------------------------------ *
 * Streaming events (server -> client, over SSE)
 * ------------------------------------------------------------------ */

export type RunEvent =
  | { type: "run_started"; runId: string; loopId: string; trigger: RunTrigger; model: string; at: number }
  | { type: "step"; runId: string; step: RunStep }
  | { type: "loop_updated"; runId: string; loop: OpenLoop }
  | { type: "world_updated"; at: number; revision: number; label: string }
  | { type: "run_finished"; runId: string; loop: OpenLoop; outcome: RunOutcome; error: string | null; at: number };

/* ------------------------------------------------------------------ *
 * The simulated external environment
 *
 * Everything below models systems outside OpenLoop. The agent can only
 * observe this state through tools, and it only changes when the world
 * changes — via a demo control now, via a real integration later.
 * ------------------------------------------------------------------ */

export type CaseKind = "REFUND" | "DOCUMENT_REQUEST";

export interface EmailAddress {
  name: string;
  address: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  /** INBOUND = arrived in the user's mailbox. */
  direction: "INBOUND" | "OUTBOUND";
  from: EmailAddress;
  to: EmailAddress[];
  body: string;
  /** ISO timestamp */
  sentAt: string;
  read: boolean;
  /** True when this inbound message has not been seen by the agent yet. */
  agentSeen: boolean;
  /** Case this message belongs to, when known. */
  caseId?: string;
}

/**
 * What an external system does when it moves into a new state: notify the
 * customer, record a timeline entry, and update its own facts.
 */
export interface CaseTransition {
  /** Timeline label recorded on the case. */
  timelineLabel: string;
  /** The case's own note about where it now stands. */
  note: string;
  /** Set when this transition means the counterparty needs something. */
  informationRequest?: string | null;
  /** Facts to merge into the case. */
  facts?: Record<string, string | number | boolean | null>;
  /** The notification email that arrives as a result of this transition. */
  email: {
    from: EmailAddress;
    subject: string;
    body: string;
  };
}

/**
 * A thing outside OpenLoop that a user's outcome can be about.
 *
 * The case describes its own state machine as data — milestones, what each
 * milestone means, and what has to happen next. The agent receives only the
 * normalized `CaseView` produced from this, and decides what to do with it.
 */
export interface CaseRecord {
  id: string;
  kind: CaseKind;
  /** Short human label, e.g. "Acme Electronics refund". */
  title: string;
  counterparty: EmailAddress;
  /** Order number, request reference, ticket id. */
  reference: string;
  /** The thing being pursued, e.g. "the $184.99 refund". */
  subject: string;
  /** Ordered milestone names, first to last. */
  milestones: string[];
  /** Current milestone. */
  status: string;
  /** The milestone that means the outcome is achieved. */
  completeStatus: string;
  /** What each milestone means, in plain language. */
  statusMeaning: Record<string, string>;
  /** What must happen to leave each milestone. */
  nextStep: Record<string, string>;
  /** When the counterparty committed to finishing. ISO date. */
  dueBy: string;
  /** Where the case currently stands, in the counterparty's words. */
  note: string;
  informationRequest: string | null;
  /** Scenario-specific facts surfaced verbatim to the agent. */
  facts: Record<string, string | number | boolean | null>;
  timeline: { at: string; label: string }[];
  /** What the external system does on entering each milestone. */
  onEnter: Record<string, CaseTransition>;
  /**
   * A reply that arrives without moving the milestone chain. Models the
   * "we're looking into it" response the agent has to interpret as no progress.
   */
  holdingReply: { subject: string; body: string };
  /** What the external system says when it needs something from the customer. */
  informationRequestEmail: { subject: string; body: string };
  /** Phrases that bind a user's sentence to this case during intake. */
  outcomeKeywords: string[];
}

/**
 * The normalized result every "inspect an external case" tool returns.
 *
 * Both `check_refund_status` and `check_request_status` produce this exact
 * shape, which is what lets the agent reason about any scenario with the same
 * logic instead of branching on refund-specific fields.
 */
export interface CaseView {
  found: true;
  caseId: string;
  kind: CaseKind;
  title: string;
  counterparty: EmailAddress;
  reference: string;
  subject: string;
  status: string;
  statusMeaning: string;
  milestones: string[];
  /** Milestones before the current one. */
  completedMilestones: string[];
  completeStatus: string;
  isComplete: boolean;
  /** What the external system says must happen next. */
  nextStep: string;
  dueBy: string;
  isOverdue: boolean;
  daysOverdue: number;
  informationRequest: string | null;
  note: string;
  facts: Record<string, string | number | boolean | null>;
  timeline: { at: string; label: string }[];
}

export interface Reminder {
  id: string;
  loopId: string;
  question: string;
  reason: string;
  createdAt: string;
  dueAt: string | null;
}

export interface ExternalWorldState {
  /** The simulated user whose mailbox the agent operates in. */
  user: EmailAddress;
  mailbox: EmailMessage[];
  cases: CaseRecord[];
  reminders: Reminder[];
  /** Increments on every external state change; drives "the agent notices". */
  revision: number;
  lastChangeAt: string;
  lastChangeLabel: string;
}

/** A case summarised for the demo control panel. */
export interface CaseSummary {
  id: string;
  kind: CaseKind;
  title: string;
  counterparty: EmailAddress;
  reference: string;
  subject: string;
  status: string;
  completeStatus: string;
  milestones: string[];
  statusMeaning: string;
  dueBy: string;
  note: string;
  informationRequest: string | null;
  isComplete: boolean;
}

export interface ExternalWorldSnapshot {
  user: EmailAddress;
  cases: CaseSummary[];
  mailbox: EmailMessage[];
  reminders: Reminder[];
  revision: number;
  lastChangeAt: string;
  lastChangeLabel: string;
}

/**
 * Demo controls are generic verbs, not scenario-specific buttons. A new
 * scenario needs no UI work: the panel renders the case's own state machine
 * and drives it through these.
 */
export const DEMO_ACTIONS = [
  "COUNTERPARTY_RESPONDS",
  "COUNTERPARTY_NEEDS_INFO",
  "ADVANCE_ONE_STEP",
  "COMPLETE_OUTCOME",
  "RESET_SCENARIO",
] as const;

export type DemoActionKind = (typeof DEMO_ACTIONS)[number];

export interface DemoActionRequest {
  action: DemoActionKind;
  caseId?: string;
}

export interface DemoActionInfo {
  action: DemoActionKind;
  label: string;
  hint: string;
  /** Disabled when the case cannot move further in that direction. */
  available: boolean;
}

/* ------------------------------------------------------------------ *
 * API payloads
 * ------------------------------------------------------------------ */

export interface AgentInfo {
  provider: string;
  modelId: string;
  /** True when the deterministic policy model is driving the Strands loop. */
  simulated: boolean;
  /** True when a hosted LLM is deciding the agent's next move. */
  reasoning: boolean;
  /** Human-readable explanation of how the model was chosen. */
  note: string;
  monitorEnabled: boolean;
  monitorIntervalMs: number;
}

export interface LoopBundle {
  loop: OpenLoop;
  runs: AgentRun[];
  /** Whether a run is currently in flight for this loop. */
  running: boolean;
}

export interface CreateLoopInput {
  outcome: string;
  deadline?: number | null;
  priority?: LoopPriority;
}
