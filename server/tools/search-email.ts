import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import type { EmailMessage } from "../../shared/types";
import { truncate, type ToolContext } from "./context";

const inputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Free-text terms to match against subject lines, bodies, and participants (e.g. 'Acme refund').",
    ),
  from: z.string().optional().describe("Restrict to mail involving this address or name."),
  sinceDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Only search the last N days of email. Defaults to 400."),
  limit: z.number().int().positive().max(50).optional().describe("Maximum messages to return."),
});

function summarise(mail: EmailMessage) {
  return {
    id: mail.id,
    threadId: mail.threadId,
    direction: mail.direction,
    from: `${mail.from.name} <${mail.from.address}>`,
    to: mail.to.map((t) => t.address).join(", "),
    subject: mail.subject,
    sentAt: mail.sentAt,
    preview: truncate(mail.body, 700),
  };
}

/**
 * search_email — read the account owner's mailbox.
 *
 * This is the agent's only window into written correspondence, so results
 * include enough of each message to reason over without dumping the mailbox.
 * The read goes through `EmailProvider`, which in this repository is backed by a
 * simulated mailbox and in production would be backed by Gmail, Graph, or IMAP.
 */
export function searchEmailTool(ctx: ToolContext) {
  return tool({
    name: "search_email",
    description:
      "Search the account owner's email history. Use this to find correspondence, confirmations, receipts, and replies from companies or people. Returns the most recent matching messages with excerpts.",
    inputSchema,
    callback: async (input) => {
      const results = await ctx.providers.email.search({
        query: input.query,
        from: input.from,
        sinceDays: input.sinceDays ?? 400,
        limit: input.limit ?? 15,
      });

      const withThreads = new Map<string, number>();
      for (const mail of results) {
        withThreads.set(mail.threadId, (withThreads.get(mail.threadId) ?? 0) + 1);
      }

      return {
        query: input.query ?? null,
        from: input.from ?? null,
        count: results.length,
        threads: [...withThreads.keys()],
        results: results.map(summarise),
        hint:
          results.length === 0
            ? "No matching messages. Try broader terms, or a different sender."
            : "Threads are listed oldest-last; use the threadId with check_external_response to read a full conversation.",
      };
    },
  });
}
