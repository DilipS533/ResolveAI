import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import type { CaseKind, CaseView, CaseRecord } from "../../shared/types";
import { currentLoop, type ToolContext } from "./context";

export const inspectInputSchema = z.object({
  handle: z
    .string()
    .optional()
    .describe(
      "Reference, order number, case id, or the counterparty's name or email. Omit to use the record already recorded on this loop.",
    ),
});

/**
 * Reduce a raw external case into the normalized view every inspection tool
 * returns.
 *
 * This shape is the whole point: the agent never branches on
 * `refundStatus === 'APPROVED'` or any other scenario-specific field. It reads
 * `status`, `completeStatus`, `isComplete`, `isOverdue`, and
 * `informationRequest`, which every external system can express. Adding a third
 * scenario needs no change to the agent at all.
 *
 * Note the deliberate separation of `status` from `completeStatus`: the agent
 * has to compare them, which is what makes "submitted is not received" and
 * "approved is not paid" observable rather than assumed.
 */
export function buildCaseView(record: CaseRecord, now = Date.now()): CaseView {
  const currentIndex = record.milestones.indexOf(record.status);
  const dueAt = new Date(record.dueBy).getTime();
  const isComplete = record.status === record.completeStatus;
  const overdueMs = now - dueAt;

  return {
    found: true,
    caseId: record.id,
    kind: record.kind,
    title: record.title,
    counterparty: record.counterparty,
    reference: record.reference,
    subject: record.subject,
    status: record.status,
    statusMeaning: record.statusMeaning[record.status] ?? record.note,
    milestones: record.milestones,
    completedMilestones: currentIndex > 0 ? record.milestones.slice(0, currentIndex) : [],
    completeStatus: record.completeStatus,
    isComplete,
    nextStep: record.nextStep[record.status] ?? "",
    dueBy: record.dueBy,
    isOverdue: !isComplete && overdueMs > 0,
    daysOverdue: overdueMs > 0 ? Math.floor(overdueMs / 86400000) : 0,
    informationRequest: record.informationRequest,
    note: record.note,
    facts: record.facts,
    timeline: record.timeline,
  };
}

/** Which case kinds a given inspection tool is responsible for. */
export interface InspectToolConfig {
  name: string;
  description: string;
  kind: CaseKind;
  /** How the tool explains itself when nothing matches. */
  notFoundHint: string;
}

/**
 * Build one "look at the external record" tool.
 *
 * The refund tool and the request tool are the same code with different
 * configuration, which is exactly how a real integration set grows: one tool
 * per external system, all speaking the same result contract.
 */
export function createInspectTool(config: InspectToolConfig, ctx: ToolContext) {
  return tool({
    name: config.name,
    description: config.description,
    inputSchema: inspectInputSchema,
    callback: async (input) => {
      const loop = currentLoop(ctx);
      // This tool owns exactly one external system, and can only see that
      // system's records — the provider is the boundary, not a filter here.
      const provider = ctx.providers.cases[config.kind];
      const remembered =
        (typeof loop.context.caseId === "string" ? loop.context.caseId : undefined) ??
        (typeof loop.context.reference === "string" ? loop.context.reference : undefined) ??
        (typeof loop.context.counterparty === "string" ? loop.context.counterparty : undefined);

      const handle = input.handle ?? remembered;
      let record = handle ? await provider.lookup(handle) : undefined;

      // With no usable handle, fall back to matching the outcome the owner
      // actually asked for — requiring a stronger signal than an incidental
      // word. A record is never substituted just because it is the only one of
      // its kind: reporting the wrong record is worse than reporting that this
      // system does not know the outcome.
      if (!record) {
        record = await provider.matchOutcome(`${loop.desiredOutcome} ${loop.title}`, 2);
      }

      if (!record) {
        const available = await provider.list();
        return {
          found: false,
          kind: config.kind,
          system: provider.system,
          lookup: handle ?? null,
          available: available.map((candidate) => ({
            caseId: candidate.id,
            reference: candidate.reference,
            counterparty: candidate.counterparty.name,
          })),
          note: config.notFoundHint,
        };
      }

      const view = buildCaseView(record);

      ctx.logActivity(
        "OBSERVATION",
        `${view.title}: ${view.status.replace(/_/g, " ").toLowerCase()}`,
        { detail: view.statusMeaning, tool: config.name },
      );

      return view;
    },
  });
}
