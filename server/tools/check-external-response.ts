import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { truncate, type ToolContext } from "./context";

const inputSchema = z.object({
  from: z
    .string()
    .optional()
    .describe("Address or name of the party you are waiting on, e.g. the merchant's support address."),
  threadId: z.string().optional().describe("Only look at this conversation thread."),
  threadLimit: z.number().int().positive().max(20).optional().describe("Messages per thread to return."),
});

/**
 * check_external_response — has the other side actually replied?
 *
 * Messages the agent has already read are marked seen, so a repeat check
 * truthfully answers "still nothing new" instead of re-reading the same reply.
 */
export function checkExternalResponseTool(ctx: ToolContext) {
  return tool({
    name: "check_external_response",
    description:
      "Check whether an external party has replied since you last looked. Returns newly arrived messages plus the recent history of the relevant thread. Marks new messages as read, so calling it again only reports genuinely newer activity.",
    inputSchema,
    callback: async (input) => {
      const loop = ctx.store.getLoop(ctx.loopId);
      const threadId =
        input.threadId ??
        (typeof loop?.context.watchThreadId === "string" ? loop.context.watchThreadId : undefined);
      const counterparty =
        input.from ??
        (typeof loop?.context.counterparty === "string" ? loop.context.counterparty : undefined);
      const caseId =
        typeof loop?.context.caseId === "string" ? loop.context.caseId : undefined;

      const searched = await ctx.providers.email.search({ from: counterparty, caseId, limit: 50 });
      const candidates = searched.filter((m) => (threadId ? m.threadId === threadId : true));

      const newMessages = candidates.filter((m) => m.direction === "INBOUND" && !m.agentSeen);
      const threads = [...new Set(candidates.map((m) => m.threadId))];

      const historyFor = async (id: string) =>
        (await ctx.providers.email.thread(id, input.threadLimit ?? 6)).map((m) => ({
          id: m.id,
          direction: m.direction,
          from: `${m.from.name} <${m.from.address}>`,
          subject: m.subject,
          sentAt: m.sentAt,
          body: truncate(m.body, 900),
        }));

      if (newMessages.length > 0) {
        await ctx.providers.email.markSeen(newMessages.map((m) => m.id));
        const first = newMessages[0];
        ctx.logActivity(
          "OBSERVATION",
          `New reply from ${first.from.name || first.from.address}`,
          { detail: truncate(first.body, 220), tool: "check_external_response" },
        );
      }

      const lastOutbound = candidates.find((m) => m.direction === "OUTBOUND");

      return {
        hasNewResponse: newMessages.length > 0,
        newMessageCount: newMessages.length,
        newMessages: newMessages.map((m) => ({
          id: m.id,
          threadId: m.threadId,
          from: `${m.from.name} <${m.from.address}>`,
          subject: m.subject,
          sentAt: m.sentAt,
          body: truncate(m.body, 1400),
        })),
        waitingSince: lastOutbound?.sentAt ?? null,
        threads,
        history: await Promise.all(
          threads.slice(0, 3).map(async (id) => ({ threadId: id, messages: await historyFor(id) })),
        ),
        note:
          newMessages.length > 0
            ? "New inbound mail was found and is shown above. Interpret it before deciding the next action."
            : "No new reply yet. If a response is still pending, the loop should wait and be re-checked later rather than acting again immediately.",
      };
    },
  });
}
