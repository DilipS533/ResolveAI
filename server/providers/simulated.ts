import type {
  CaseKind,
  CaseRecord,
  EmailMessage,
  ExternalWorldState,
  Reminder,
} from "../../shared/types";
import { SimulatedWorld } from "../simulation/world";
import type {
  CaseProvider,
  EmailProvider,
  EmailQuery,
  ExternalProviders,
  OutboundEmail,
  ReminderProvider,
} from "./types";

/**
 * The simulated implementations of the provider interfaces.
 *
 * These are deliberately thin: they translate the provider contract onto the
 * simulated world's own storage and change bookkeeping. Everything that makes
 * the demo work — seeding, milestone chains, notification emails, revision
 * bumps — lives in `server/simulation/`, behind these adapters. Swapping this
 * file for an HTTP-backed one is the entire "go live" work on the external side.
 */

class SimulatedEmailProvider implements EmailProvider {
  readonly system = "simulated mailbox";

  constructor(private readonly world: SimulatedWorld) {}

  async search(query: EmailQuery = {}): Promise<EmailMessage[]> {
    return this.world.searchEmails(query);
  }

  async thread(threadId: string, limit = 10): Promise<EmailMessage[]> {
    return this.world.thread(threadId, limit);
  }

  async send(email: OutboundEmail): Promise<EmailMessage> {
    return this.world.sendEmail(email);
  }

  async markSeen(ids: string[]): Promise<void> {
    this.world.markSeen(ids);
  }

  async latestOutboundThread(address: string): Promise<string | undefined> {
    return this.world.latestOutboundThread(address);
  }
}

/**
 * One record system, restricted to a single kind of record.
 *
 * The refund ledger and the document/application system are separate providers
 * because they would be separate integrations in production. They happen to
 * share a simulated backing store here, which is an implementation detail the
 * agent never sees.
 */
class SimulatedCaseProvider implements CaseProvider {
  constructor(
    private readonly world: SimulatedWorld,
    readonly kind: CaseKind,
    readonly system: string,
  ) {}

  async list(): Promise<CaseRecord[]> {
    return this.world.listCases().filter((record) => record.kind === this.kind);
  }

  async lookup(handle: string): Promise<CaseRecord | undefined> {
    const record = this.world.findCase(handle);
    return record && record.kind === this.kind ? record : undefined;
  }

  async matchOutcome(text: string, minScore = 1): Promise<CaseRecord | undefined> {
    const record = this.world.matchCaseByOutcome(text, minScore);
    return record && record.kind === this.kind ? record : undefined;
  }
}

class SimulatedReminderProvider implements ReminderProvider {
  readonly system = "simulated reminder queue";

  constructor(private readonly world: SimulatedWorld) {}

  async create(input: {
    loopId: string;
    question: string;
    reason: string;
    dueAt?: string | null;
  }): Promise<Reminder> {
    return this.world.addReminder(input);
  }

  async list(loopId?: string): Promise<Reminder[]> {
    const all = this.world.snapshot().reminders;
    return loopId ? all.filter((reminder) => reminder.loopId === loopId) : all;
  }
}

export function createSimulatedProviders(world: SimulatedWorld): ExternalProviders {
  const cases: Record<CaseKind, CaseProvider> = {
    REFUND: new SimulatedCaseProvider(world, "REFUND", "merchant refund system"),
    DOCUMENT_REQUEST: new SimulatedCaseProvider(
      world,
      "DOCUMENT_REQUEST",
      "document & application system",
    ),
  };

  return {
    email: new SimulatedEmailProvider(world),
    reminders: new SimulatedReminderProvider(world),
    cases,
    async resolveCase(text: string): Promise<CaseRecord | undefined> {
      // Ask each connected system whether it recognises this outcome. A real
      // deployment issues the same query to each integration it has.
      for (const provider of Object.values(cases)) {
        const record = await provider.matchOutcome(text);
        if (record) return record;
      }
      return undefined;
    },
    get revision(): number {
      return world.revision;
    },
    get lastChangeLabel(): string {
      return world.raw().lastChangeLabel;
    },
    get lastChangeAt(): string {
      return world.raw().lastChangeAt;
    },
  };
}

export type { ExternalWorldState };
