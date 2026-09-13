import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { newId } from "../util/id";
import { currentLoop, type ToolContext } from "./context";

const inputSchema = z.object({
  question: z
    .string()
    .describe("The single, specific thing the account owner needs to do or answer."),
  reason: z
    .string()
    .describe("Why OpenLoop cannot resolve this on its own, e.g. it needs information only the owner has."),
  dueAt: z
    .string()
    .optional()
    .describe("Optional ISO timestamp by which the human action is needed."),
});

/**
 * create_reminder — hand a genuinely human decision back to the owner.
 *
 * This is the only escape hatch out of autonomy: the loop moves to
 * NEEDS_HUMAN and stops acting until the owner answers, instead of guessing.
 */
export function createReminderTool(ctx: ToolContext) {
  return tool({
    name: "create_reminder",
    description:
      "Ask the account owner for something only a human can provide — a fact you do not have, a decision, a payment, or an in-person action. Use this only when no available tool can move the outcome forward. It moves the loop to NEEDS_HUMAN and pauses autonomous action.",
    inputSchema,
    callback: async (input) => {
      const loop = currentLoop(ctx);
      const reminder = await ctx.providers.reminders.create({
        loopId: loop.id,
        question: input.question,
        reason: input.reason,
        dueAt: input.dueAt ?? null,
      });

      const humanRequest = {
        id: newId("human"),
        question: input.question,
        reason: input.reason,
        createdAt: Date.now(),
      };

      const previousStatus = loop.status;
      ctx.store.patchLoop(loop.id, {
        status: "NEEDS_HUMAN",
        humanRequest,
        waitingFor: `You: ${input.question}`,
        nextAction: "Resume once the account owner responds",
        nextCheckAt: null,
        lastAction: `Asked the account owner for help: ${input.question}`,
        currentState: `OpenLoop cannot continue without the account owner. ${input.reason}`,
      });

      ctx.logActivity("ESCALATION", "OpenLoop needs your input to continue", {
        detail: input.question,
        tool: "create_reminder",
      });
      // A pause is a real state transition, so it is recorded as one and the
      // new state is pushed to any connected client immediately.
      if (previousStatus !== "NEEDS_HUMAN") {
        ctx.logStateChange(previousStatus, "NEEDS_HUMAN", input.reason);
      }
      ctx.publishLoop(currentLoop(ctx));

      return {
        created: true,
        reminderId: reminder.id,
        question: input.question,
        reason: input.reason,
        loopStatus: "NEEDS_HUMAN",
        note: "The loop is paused until the owner responds. Stop here and summarise what you need from them.",
      };
    },
  });
}
