import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import type { ToolContext } from "./context";

const inputSchema = z.object({
  to: z.string().describe("Recipient email address."),
  toName: z.string().optional().describe("Recipient display name."),
  subject: z.string().describe("Subject line. Keep 'Re: …' when replying into a thread."),
  body: z.string().describe("Plain-text body of the email."),
  threadId: z
    .string()
    .optional()
    .describe(
      "Thread to send into, so the company's reply lands where you can watch for it. Omit to start a new thread.",
    ),
  purpose: z
    .string()
    .describe("One short sentence describing why this email is necessary, e.g. 'Chase an overdue refund'."),
});

/**
 * send_email — act on the outside world.
 *
 * Sending is a real side effect: the message is delivered through
 * `EmailProvider` into the external system, and any reply arrives in that same
 * thread. Nothing here decides who to write to or what to say — the agent does,
 * and this tool reports only what actually happened.
 */
export function sendEmailTool(ctx: ToolContext) {
  return tool({
    name: "send_email",
    description:
      "Send an email as the account owner into the external environment. Use this to chase a company, supply requested information, or confirm something. Returns the message id and the thread to watch for a reply.",
    inputSchema,
    callback: async (input) => {
      const loop = ctx.store.getLoop(ctx.loopId);
      const caseId = typeof loop?.context.caseId === "string" ? loop.context.caseId : undefined;
      const message = await ctx.providers.email.send({
        to: { name: input.toName, address: input.to },
        subject: input.subject,
        body: input.body,
        threadId: input.threadId,
        caseId,
      });

      ctx.logActivity("ACTION", `Sent an email to ${input.to}`, {
        detail: input.purpose,
        tool: "send_email",
      });

      return {
        sent: true,
        messageId: message.id,
        threadId: message.threadId,
        subject: message.subject,
        to: input.to,
        sentAt: message.sentAt,
        note: "The message is on its way. Replies will arrive in this thread — use check_external_response with this threadId to watch for them.",
      };
    },
  });
}
