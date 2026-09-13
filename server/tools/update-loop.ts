import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import {
  ACTIVITY_KINDS,
  ENTITY_KINDS,
  LOOP_PRIORITIES,
  LOOP_STATUSES,
  type ActivityEntry,
  type LoopContext,
  type OpenLoop,
} from "../../shared/types";
import { activity } from "../agent/activity";
import { currentLoop, type ToolContext } from "./context";

const contextValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const inputSchema = z.object({
  notes: z
    .string()
    .describe(
      "One or two sentences explaining what you concluded from the evidence. Shown to the user as the reasoning summary.",
    ),
  status: z
    .enum(LOOP_STATUSES)
    .optional()
    .describe(
      "ACTIVE = still working now. WAITING = everything possible is done and you are monitoring an external event. NEEDS_HUMAN = blocked on the owner. AT_RISK = no progress and a deadline is close or passed. RESOLVED = the outcome is verified, not merely promised.",
    ),
  currentState: z.string().optional().describe("Plain-language description of what is true right now."),
  nextAction: z.string().optional().describe("What OpenLoop will do next."),
  lastAction: z.string().optional().describe("The last thing OpenLoop actually did."),
  waitingFor: z
    .string()
    .optional()
    .describe("The specific external event you are blocked on. Required when status is WAITING."),
  clearWaitingFor: z.boolean().optional().describe("Set true to clear waitingFor."),
  nextCheckInHours: z
    .number()
    .positive()
    .optional()
    .describe("When to look again, in hours from now. Preferred over nextCheckAt."),
  nextCheckAt: z.string().optional().describe("When to look again, as an ISO-8601 timestamp."),
  clearNextCheck: z.boolean().optional().describe("Set true to stop future monitoring."),
  deadline: z.string().optional().describe("ISO-8601 deadline for the outcome."),
  priority: z.enum(LOOP_PRIORITIES).optional(),
  description: z
    .string()
    .optional()
    .describe("Replace the loop description once you understand the situation."),
  title: z.string().optional().describe("Replace the loop title if yours is more accurate."),
  completionCriteria: z
    .array(z.string())
    .optional()
    .describe("The conditions that must be true for this outcome to count as resolved."),
  relevantEntities: z
    .array(
      z.object({
        kind: z.enum(ENTITY_KINDS),
        label: z.string(),
        detail: z.string().optional(),
      }),
    )
    .optional()
    .describe("Companies, people, orders, or payments involved. Replaces the existing list."),
  context: z
    .record(z.string(), contextValue)
    .optional()
    .describe(
      "Durable memory to merge into the loop (thread ids, case ids, amounts, references). Values are stored as-is.",
    ),
  resolutionSummary: z
    .string()
    .optional()
    .describe("When resolving, a short paragraph describing how the outcome was verified."),
  activity: z
    .array(
      z.object({
        kind: z.enum(ACTIVITY_KINDS),
        summary: z.string().describe("Short, user-facing, no reasoning traces."),
        detail: z.string().optional(),
      }),
    )
    .optional()
    .describe(
      "Timeline entries to append, in order. Use for interpretations, state changes, and the resolution.",
    ),
});

function toTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * update_loop — the agent's write path into persistent state.
 *
 * This is what makes an OpenLoop a durable commitment rather than a chat
 * message: every decision, its reasoning summary, and what the agent is now
 * waiting on are committed here and survive process restarts.
 */
export function updateLoopTool(ctx: ToolContext) {
  return tool({
    name: "update_loop",
    description:
      "Update the open loop's persistent state: status, current state, next action, what you are waiting for, entities, memory, and the activity timeline. Call this at the end of every run so the outcome survives without you, and whenever your understanding changes.",
    inputSchema,
    callback: (input) => {
      const loop = currentLoop(ctx);

      const waitingFor = input.clearWaitingFor
        ? null
        : input.waitingFor ?? (input.status === "RESOLVED" ? null : loop.waitingFor);

      if (input.status === "WAITING" && !waitingFor) {
        return {
          updated: false,
          error:
            "Status WAITING requires waitingFor: name the specific external event you are monitoring. Retry with waitingFor set, or choose NEEDS_HUMAN if you are blocked on the owner.",
        };
      }

      const nextCheckAt =
        input.clearNextCheck || input.status === "RESOLVED"
          ? null
          : input.nextCheckInHours
            ? Date.now() + input.nextCheckInHours * 3600000
            : toTimestamp(input.nextCheckAt) ?? loop.nextCheckAt;

      const entries: ActivityEntry[] = (input.activity ?? []).map((entry) =>
        activity(entry.kind, entry.summary, { detail: entry.detail, tool: "update_loop" }),
      );
      if (entries.length === 0) {
        entries.push(activity("INTERPRETATION", input.notes));
      }
      if (input.status === "WAITING" && waitingFor) {
        entries.push(activity("WAITING", `Monitoring: ${waitingFor}`));
      }
      if (input.status === "RESOLVED") {
        entries.push(
          activity("RESOLVED", "Outcome verified and resolved", {
            detail: input.resolutionSummary ?? input.notes,
          }),
        );
      }

      const previousStatus = loop.status;
      const nextStatus = input.status && input.status !== loop.status ? input.status : null;

      const patch: Partial<OpenLoop> = {
        context: { ...loop.context, ...(input.context ?? {}) } as LoopContext,
        waitingFor,
        nextCheckAt,
        lastAction: input.lastAction ?? loop.lastAction,
        nextAction: input.nextAction ?? loop.nextAction,
        currentState: input.currentState ?? input.notes,
        activityLog: [...loop.activityLog, ...entries],
      };

      if (nextStatus) {
        patch.status = nextStatus;
        if (nextStatus === "RESOLVED") {
          patch.resolvedAt = Date.now();
          patch.resolutionSummary = input.resolutionSummary ?? input.currentState ?? input.notes;
        }
        if (nextStatus !== "NEEDS_HUMAN") {
          patch.humanRequest = null;
        }
      }
      if (input.priority) patch.priority = input.priority;
      if (input.description) patch.description = input.description;
      if (input.title) patch.title = input.title;
      if (input.completionCriteria) patch.completionCriteria = input.completionCriteria;
      if (input.relevantEntities) {
        patch.relevantEntities = input.relevantEntities.map((entity, index) => ({
          id: `${loop.id}_entity_${index}`,
          kind: entity.kind,
          label: entity.label,
          ...(entity.detail ? { detail: entity.detail } : {}),
        }));
      }
      const deadline = toTimestamp(input.deadline);
      if (deadline) patch.deadline = deadline;

      const updated = ctx.store.patchLoop(loop.id, patch);
      if (!updated) {
        return { updated: false, error: `Open loop ${loop.id} no longer exists` };
      }

      // A status transition is its own recorded event, never inferred by the UI.
      if (nextStatus) {
        ctx.logStateChange(previousStatus, nextStatus, input.notes);
      }
      ctx.publishLoop(ctx.store.getLoop(loop.id) ?? updated);

      return {
        updated: true,
        status: updated.status,
        waitingFor: updated.waitingFor,
        nextCheckAt: updated.nextCheckAt ? new Date(updated.nextCheckAt).toISOString() : null,
        activityAdded: entries.map((entry) => entry.summary),
        note:
          updated.status === "RESOLVED"
            ? "Outcome recorded as resolved. Confirm in your final message and stop."
            : "State committed. If nothing else can move this forward right now, stop and end your turn.",
      };
    },
  });
}
