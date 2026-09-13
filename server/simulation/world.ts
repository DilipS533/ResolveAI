import type {
  CaseSummary,
  DemoActionKind,
  DemoActionRequest,
  CaseRecord,
  EmailMessage,
  Reminder,
  ExternalWorldState,
  ExternalWorldSnapshot,
} from "../../shared/types";
import { newId } from "../util/id";
import { createSimulatedWorld, NOW } from "./cases";

export interface EmailSearchQuery {
  /** Free-text terms matched against subject, body, and participant names. */
  query?: string;
  from?: string;
  /** Restrict to a specific case's correspondence. */
  caseId?: string;
  /** Only include mail from the last N days of simulated time. */
  sinceDays?: number;
  limit?: number;
}

export interface DemoActionResult {
  label: string;
  detail: string;
  /** True when the case's milestone actually moved. */
  advanced: boolean;
  caseId: string | null;
}

/**
 * The simulated external environment.
 *
 * It holds cases (things outside OpenLoop a user's outcome can be about), the
 * user's mailbox, and reminders. Every mutation bumps `revision`, which is how
 * the monitor learns "the outside world changed".
 *
 * Nothing here is refund-specific. Cases carry their own milestone chain as
 * data, and the demo controls are generic verbs (`advance one step`, `complete
 * outcome`) that operate on any case.
 */
export class SimulatedWorld {
  constructor(
    private state: ExternalWorldState,
    private readonly onChange: () => void,
  ) {}

  get revision(): number {
    return this.state.revision;
  }

  raw(): ExternalWorldState {
    return this.state;
  }

  replaceState(next: ExternalWorldState): void {
    this.state = next;
    this.touch("Scenarios reset to their starting state");
  }

  resetScenario(): void {
    this.replaceState(createSimulatedWorld());
  }

  private touch(label: string): void {
    this.state.revision += 1;
    this.state.lastChangeAt = new Date().toISOString();
    this.state.lastChangeLabel = label;
    this.onChange();
  }

  /* ---------------------------------------------------------------- *
   * Snapshot for the UI
   * ---------------------------------------------------------------- */

  private summarise(simCase: CaseRecord): CaseSummary {
    return {
      id: simCase.id,
      kind: simCase.kind,
      title: simCase.title,
      counterparty: simCase.counterparty,
      reference: simCase.reference,
      subject: simCase.subject,
      status: simCase.status,
      completeStatus: simCase.completeStatus,
      milestones: simCase.milestones,
      statusMeaning: simCase.statusMeaning[simCase.status] ?? simCase.note,
      dueBy: simCase.dueBy,
      note: simCase.note,
      informationRequest: simCase.informationRequest,
      isComplete: simCase.status === simCase.completeStatus,
    };
  }

  snapshot(): ExternalWorldSnapshot {
    return {
      user: this.state.user,
      cases: this.state.cases.map((simCase) => this.summarise(simCase)),
      mailbox: [...this.state.mailbox].sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1)),
      reminders: this.state.reminders,
      revision: this.state.revision,
      lastChangeAt: this.state.lastChangeAt,
      lastChangeLabel: this.state.lastChangeLabel,
    };
  }

  /* ---------------------------------------------------------------- *
   * Email
   * ---------------------------------------------------------------- */

  searchEmails(query: EmailSearchQuery = {}): EmailMessage[] {
    const { query: text, from, caseId, sinceDays = 400, limit = 25 } = query;
    const cutoff = Date.now() - sinceDays * 86400000;
    const terms = (text ?? "")
      .toLowerCase()
      .split(/[^a-z0-9@.$-]+/)
      .filter((term) => term.length > 2);
    const fromNeedle = from?.toLowerCase();

    return this.state.mailbox
      .filter((mail) => new Date(mail.sentAt).getTime() >= cutoff)
      .filter((mail) => (caseId ? mail.caseId === caseId : true))
      .filter((mail) => {
        if (!fromNeedle) return true;
        return (
          mail.from.address.toLowerCase().includes(fromNeedle) ||
          mail.from.name.toLowerCase().includes(fromNeedle) ||
          mail.to.some((address) => address.address.toLowerCase().includes(fromNeedle))
        );
      })
      .filter((mail) => {
        if (terms.length === 0) return true;
        const haystack = [
          mail.subject,
          mail.body,
          mail.from.name,
          mail.from.address,
          ...mail.to.map((address) => address.address),
        ]
          .join(" ")
          .toLowerCase();
        return terms.some((term) => haystack.includes(term));
      })
      .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))
      .slice(0, limit);
  }

  emailById(id: string): EmailMessage | undefined {
    return this.state.mailbox.find((mail) => mail.id === id);
  }

  /** Most recent messages in a thread, oldest first. */
  thread(threadId: string, limit = 10): EmailMessage[] {
    return this.state.mailbox
      .filter((mail) => mail.threadId === threadId)
      .sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1))
      .slice(-limit);
  }

  markSeen(ids: string[]): void {
    let changed = false;
    for (const mail of this.state.mailbox) {
      if (ids.includes(mail.id) && !mail.agentSeen) {
        mail.agentSeen = true;
        changed = true;
      }
    }
    if (changed) this.touch("Agent reviewed incoming mail");
  }

  /**
   * Send mail from the simulated user. Returns the stored message plus the
   * thread it landed in, which the agent uses to watch for a reply.
   */
  sendEmail(input: {
    to: { name?: string; address: string };
    subject: string;
    body: string;
    threadId?: string;
    caseId?: string;
  }): EmailMessage {
    const threadId =
      input.threadId ??
      this.latestOutboundThread(input.to.address) ??
      this.state.mailbox.find(
        (mail) => mail.direction === "OUTBOUND" && mail.to.some((to) => to.address === input.to.address),
      )?.threadId ??
      newId("thread");

    const mail: EmailMessage = {
      id: newId("mail"),
      threadId,
      subject: input.subject,
      direction: "OUTBOUND",
      from: this.state.user,
      to: [{ name: input.to.name ?? input.to.address, address: input.to.address }],
      body: input.body,
      sentAt: new Date().toISOString(),
      read: true,
      agentSeen: true,
      ...(input.caseId ? { caseId: input.caseId } : {}),
    };
    this.state.mailbox.push(mail);
    this.touch(`Outbound email sent to ${input.to.address}`);
    return mail;
  }

  /** Latest thread the simulated user has written to this address in. */
  latestOutboundThread(address: string): string | undefined {
    return [...this.state.mailbox]
      .filter((mail) => mail.direction === "OUTBOUND" && mail.to.some((to) => to.address === address))
      .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))[0]?.threadId;
  }

  private postInbound(simCase: CaseRecord, subject: string, body: string, from?: CaseRecord["counterparty"]): EmailMessage {
    const threadId = this.latestOutboundThread(simCase.counterparty.address) ?? newId("thread");
    const mail: EmailMessage = {
      id: newId("mail"),
      threadId,
      subject,
      direction: "INBOUND",
      from: from ?? simCase.counterparty,
      to: [this.state.user],
      body,
      sentAt: new Date().toISOString(),
      read: false,
      agentSeen: false,
      caseId: simCase.id,
    };
    this.state.mailbox.push(mail);
    return mail;
  }

  /* ---------------------------------------------------------------- *
   * Cases
   * ---------------------------------------------------------------- */

  listCases(): CaseRecord[] {
    return this.state.cases;
  }

  /** Resolve a free-text handle (id, reference, counterparty) to a case. */
  findCase(handle: string | undefined): CaseRecord | undefined {
    if (!handle) return undefined;
    const needle = handle.toLowerCase().trim();
    if (!needle) return undefined;
    return this.state.cases.find(
      (simCase) =>
        simCase.id.toLowerCase() === needle ||
        simCase.reference.toLowerCase() === needle ||
        simCase.title.toLowerCase().includes(needle) ||
        simCase.counterparty.name.toLowerCase().includes(needle) ||
        simCase.counterparty.address.toLowerCase() === needle ||
        simCase.outcomeKeywords.some((keyword) => keyword === needle),
    );
  }

  /**
   * Best match for a user's free-text outcome, if any.
   *
   * `minScore` lets callers demand a stronger signal than a single incidental
   * keyword — a stray word like "return" should not silently bind an unrelated
   * outcome to someone else's case.
   */
  matchCaseByOutcome(outcome: string, minScore = 1): CaseRecord | undefined {
    const haystack = outcome.toLowerCase();
    let best: { simCase: CaseRecord; score: number } | undefined;
    for (const simCase of this.state.cases) {
      let score = 0;
      if (this.mentions(haystack, simCase.counterparty.name.toLowerCase())) score += 5;
      if (this.mentions(haystack, simCase.reference.toLowerCase())) score += 4;
      for (const keyword of simCase.outcomeKeywords) {
        if (keyword.length >= 4 && this.mentions(haystack, keyword)) score += 2;
      }
      // A bare first word of the counterparty ("acme") is a strong signal too.
      const firstWord = simCase.counterparty.name.split(/\s+/)[0]?.toLowerCase();
      if (firstWord && firstWord.length >= 4 && this.mentions(haystack, firstWord)) score += 3;
      if (score > 0 && (!best || score > best.score)) best = { simCase, score };
    }
    return best && best.score >= minScore ? best.simCase : undefined;
  }

  /**
   * Whole-term matching.
   *
   * A keyword has to appear as a term, not merely as a substring. Without this,
   * the refund scenario's "return" keyword matches the words "returned" and
   * "returns" in any unrelated sentence — which is exactly how an outcome gets
   * silently bound to the wrong external record.
   */
  private mentions(haystack: string, term: string): boolean {
    if (!term.trim()) return false;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(haystack);
  }

  /** The case a loop is attached to, if any. */
  caseForHandle(handle: string | undefined): CaseRecord | undefined {
    if (!handle) return undefined;
    const direct = this.findCase(handle);
    if (direct) return direct;
    return this.matchCaseByOutcome(handle);
  }

  private nextMilestone(simCase: CaseRecord): string | undefined {
    const index = simCase.milestones.indexOf(simCase.status);
    if (index < 0) return undefined;
    return simCase.milestones[index + 1];
  }

  /* ---------------------------------------------------------------- *
   * Reminders
   * ---------------------------------------------------------------- */

  addReminder(input: { loopId: string; question: string; reason: string; dueAt?: string | null }): Reminder {
    const reminder: Reminder = {
      id: newId("rem"),
      loopId: input.loopId,
      question: input.question,
      reason: input.reason,
      createdAt: new Date().toISOString(),
      dueAt: input.dueAt ?? null,
    };
    this.state.reminders.push(reminder);
    this.touch("Reminder queued for the account owner");
    return reminder;
  }

  /* ---------------------------------------------------------------- *
   * Demo controls — the only way this simulated world advances
   * ---------------------------------------------------------------- */

  private resolveCase(caseId?: string): CaseRecord {
    if (caseId) {
      const found = this.findCase(caseId);
      if (found) return found;
    }
    const firstIncomplete = this.state.cases.find((simCase) => simCase.status !== simCase.completeStatus);
    const fallback = firstIncomplete ?? this.state.cases[0];
    if (!fallback) throw new Error("The simulated world contains no cases");
    return fallback;
  }

  /** Move a case into a milestone and apply everything that comes with it. */
  private enterStatus(simCase: CaseRecord, status: string): void {
    const transition = simCase.onEnter[status];
    simCase.status = status;
    if (transition) {
      simCase.note = transition.note;
      // A blocker belongs to the milestone that raised it. Moving on clears it,
      // otherwise a resolved request would keep the case looking blocked.
      simCase.informationRequest = transition.informationRequest ?? null;
      for (const [key, value] of Object.entries(transition.facts ?? {})) {
        simCase.facts[key] = value === NOW ? new Date().toISOString() : value;
      }
      simCase.timeline.push({ at: new Date().toISOString(), label: transition.timelineLabel });
      this.postInbound(simCase, transition.email.subject, transition.email.body, transition.email.from);
      this.touch(`${simCase.title}: ${transition.timelineLabel}`);
    } else {
      simCase.timeline.push({ at: new Date().toISOString(), label: `Moved to ${status}` });
      this.touch(`${simCase.title}: moved to ${status}`);
    }
  }

  /** What demo verbs make sense for a case right now — drives the control panel. */
  demoActionsFor(caseId: string): { action: DemoActionKind; available: boolean }[] {
    const simCase = this.findCase(caseId);
    const complete = simCase ? simCase.status === simCase.completeStatus : true;
    return [
      { action: "COUNTERPARTY_RESPONDS", available: !complete },
      { action: "COUNTERPARTY_NEEDS_INFO", available: !complete },
      { action: "ADVANCE_ONE_STEP", available: !complete },
      { action: "COMPLETE_OUTCOME", available: !complete },
      { action: "RESET_SCENARIO", available: true },
    ];
  }

  applyDemoAction(req: DemoActionRequest): DemoActionResult {
    if (req.action === "RESET_SCENARIO") {
      this.resetScenario();
      return {
        label: "Scenarios reset",
        detail: "Every case is back at its starting state and the mailbox is back to its seed.",
        advanced: false,
        caseId: null,
      };
    }

    const simCase = this.resolveCase(req.caseId);
    const complete = simCase.status === simCase.completeStatus;

    switch (req.action) {
      case "COUNTERPARTY_RESPONDS": {
        this.postInbound(simCase, simCase.holdingReply.subject, simCase.holdingReply.body);
        simCase.note = `${simCase.counterparty.name} replied without changing the case status.`;
        this.touch(`${simCase.counterparty.name} replied — status unchanged`);
        return {
          label: "Counterparty responded",
          detail: `${simCase.counterparty.name} replied, but the status is still ${simCase.status}. A reply is not progress.`,
          advanced: false,
          caseId: simCase.id,
        };
      }

      case "COUNTERPARTY_NEEDS_INFO": {
        simCase.informationRequest =
          simCase.kind === "REFUND"
            ? "The RMA number written on the outside of the returned package, or a photo of the shipping label."
            : "Your Westbrook applicant ID (it starts with ACK-) and the exact portal link for the recommendation upload.";
        simCase.note = `${simCase.counterparty.name} needs information from the customer before it can proceed.`;
        simCase.timeline.push({
          at: new Date().toISOString(),
          label: `${simCase.counterparty.name} requested information`,
        });
        this.postInbound(simCase, simCase.informationRequestEmail.subject, simCase.informationRequestEmail.body);
        this.touch(`${simCase.counterparty.name} requested information from the customer`);
        return {
          label: "Counterparty needs information",
          detail: `${simCase.counterparty.name} is blocked on something only the account owner can provide.`,
          advanced: false,
          caseId: simCase.id,
        };
      }

      case "ADVANCE_ONE_STEP": {
        const next = this.nextMilestone(simCase);
        if (!next) {
          return {
            label: "Already complete",
            detail: `${simCase.title} is already at its final milestone (${simCase.status}).`,
            advanced: false,
            caseId: simCase.id,
          };
        }
        this.enterStatus(simCase, next);
        return {
          label: "Moved one step",
          detail: `${simCase.title} → ${next}. ${
            next === simCase.completeStatus ? "This is the outcome being achieved." : "This is not the outcome yet."
          }`,
          advanced: true,
          caseId: simCase.id,
        };
      }

      case "COMPLETE_OUTCOME": {
        if (complete) {
          return {
            label: "Already complete",
            detail: `${simCase.title} is already at ${simCase.completeStatus}.`,
            advanced: false,
            caseId: simCase.id,
          };
        }
        const reached: string[] = [];
        let next = this.nextMilestone(simCase);
        while (next) {
          this.enterStatus(simCase, next);
          reached.push(next);
          next = this.nextMilestone(simCase);
        }
        return {
          label: "Outcome achieved",
          detail: `${simCase.title} moved through ${reached.join(" → ")}. The outcome is now observable.`,
          advanced: true,
          caseId: simCase.id,
        };
      }

      default: {
        const exhaustive: never = req.action;
        throw new Error(`Unknown demo action: ${String(exhaustive)}`);
      }
    }
  }
}
