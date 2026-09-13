import type { ToolList } from "@strands-agents/sdk";
import type { ToolContext } from "./context";
import { searchEmailTool } from "./search-email";
import { sendEmailTool } from "./send-email";
import { checkRefundStatusTool } from "./check-refund-status";
import { checkRequestStatusTool } from "./check-request-status";
import { checkExternalResponseTool } from "./check-external-response";
import { createReminderTool } from "./create-reminder";
import { updateLoopTool } from "./update-loop";

export type { ToolContext } from "./context";
export { describeToolCall, toolLabel } from "./describe";

/**
 * The agent's complete toolkit for one run.
 *
 * Tools are added here and nowhere else — the runtime, the reasoning, and the
 * UI all discover capabilities from this registry. Adding a real integration
 * (Gmail, Stripe, DocuSign, a merchant API) means one new file plus one line.
 *
 * Note that `check_refund_status` and `check_request_status` are separate
 * tools covering separate external systems even though they share an
 * implementation. That is deliberate: in production they would be genuinely
 * different integrations, and the agent should be able to tell them apart.
 */
export function buildOpenLoopTools(ctx: ToolContext): ToolList {
  return [
    // Observe the outside world
    searchEmailTool(ctx),
    checkRefundStatusTool(ctx),
    checkRequestStatusTool(ctx),
    checkExternalResponseTool(ctx),
    // Act on the outside world
    sendEmailTool(ctx),
    createReminderTool(ctx),
    // Commit state
    updateLoopTool(ctx),
  ];
}

/** Ordered catalog used by the UI and the README to document capabilities. */
export const TOOL_CATALOG = [
  {
    name: "search_email",
    group: "Observe",
    description: "Read the owner's mailbox",
  },
  {
    name: "check_refund_status",
    group: "Observe",
    description: "Read the refund system",
  },
  {
    name: "check_request_status",
    group: "Observe",
    description: "Read the document/application system",
  },
  {
    name: "check_external_response",
    group: "Observe",
    description: "Detect a reply that arrived",
  },
  { name: "send_email", group: "Act", description: "Write to a company or person" },
  { name: "create_reminder", group: "Escalate", description: "Hand a decision back to the owner" },
  { name: "update_loop", group: "Commit", description: "Persist status, next action and timeline" },
] as const;
