import type {
  CaseKind,
  CaseRecord,
  CaseSummary,
  EmailMessage,
  Reminder,
} from "../../shared/types";

/**
 * The boundary between OpenLoop and everything outside it.
 *
 * The agent is only ever given these interfaces. It cannot reach a mailbox, a
 * merchant's record, or a reminder, and it cannot mutate any of them except
 * through a method declared here. `server/simulation/` provides the simulated
 * implementations used by the demo; a production deployment provides HTTP-backed
 * ones (`GmailEmailProvider`, `StripeRefundProvider`, …) without the agent, the
 * tools, the loop model, or the client changing at all.
 *
 * Every method returns a Promise, including the simulated ones. That is
 * deliberate: real providers are network calls, and a synchronous interface
 * would have forced a rewrite of every tool on the day it stopped being a demo.
 */

export interface EmailQuery {
  /** Free-text terms matched against subject, body and participants. */
  query?: string;
  /** Restrict to mail involving this address or name. */
  from?: string;
  /** Restrict to one case's correspondence. */
  caseId?: string;
  /** Only look this many days back. */
  sinceDays?: number;
  limit?: number;
}

export interface OutboundEmail {
  to: { name?: string; address: string };
  subject: string;
  body: string;
  /** Send into an existing conversation so a reply lands where it can be watched. */
  threadId?: string;
  caseId?: string;
}

/** Read and write the account owner's mailbox. */
export interface EmailProvider {
  readonly system: string;
  search(query?: EmailQuery): Promise<EmailMessage[]>;
  /** Most recent messages in a thread, oldest first. */
  thread(threadId: string, limit?: number): Promise<EmailMessage[]>;
  send(email: OutboundEmail): Promise<EmailMessage>;
  /** Mark inbound messages as reviewed, so a later check reports only genuinely newer mail. */
  markSeen(ids: string[]): Promise<void>;
  latestOutboundThread(address: string): Promise<string | undefined>;
}

/**
 * Read one external system that holds records an outcome can be about — a
 * merchant's refund ledger, a university's application checklist, a courier's
 * delivery record. One provider per system, each owning one `kind`.
 */
export interface CaseProvider {
  /** The kind of external record this system holds. */
  readonly kind: CaseKind;
  readonly system: string;
  /** Records this system knows about, for diagnostics and demo tooling. */
  list(): Promise<CaseRecord[]>;
  /** Resolve a reference, case id, counterparty name, or address. */
  lookup(handle: string): Promise<CaseRecord | undefined>;
  /**
   * Best match for a free-text outcome. `minScore` lets the caller demand more
   * than one incidental word before binding an outcome to a record.
   */
  matchOutcome(text: string, minScore?: number): Promise<CaseRecord | undefined>;
}

/** Things the agent can ask the owner to do, when nothing else can move the loop. */
export interface ReminderProvider {
  readonly system: string;
  create(input: { loopId: string; question: string; reason: string; dueAt?: string | null }): Promise<Reminder>;
  list(loopId?: string): Promise<Reminder[]>;
}

export interface ExternalProviders {
  readonly email: EmailProvider;
  readonly reminders: ReminderProvider;
  /** Every connected record system, keyed by the kind of record it holds. */
  readonly cases: Record<CaseKind, CaseProvider>;
  /**
   * Ask every connected system whether this text is about any of its records.
   * This is how intake discovers which external system an outcome belongs to —
   * in production it would query each integration the same way.
   */
  resolveCase(text: string): Promise<CaseRecord | undefined>;
  /**
   * Monotonic revision of the outside world, bumped whenever anything external
   * changes. The runtime uses it to decide whether a loop has unseen news; a
   * production deployment replaces this with webhooks or a schedule.
   */
  readonly revision: number;
  readonly lastChangeLabel: string;
  readonly lastChangeAt: string;
}

export type { CaseRecord, CaseSummary, CaseKind, EmailMessage, Reminder };
