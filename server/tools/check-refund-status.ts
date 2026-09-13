import type { ToolContext } from "./context";
import { createInspectTool } from "./inspect-case";

/**
 * check_refund_status — the refund system's side of the story.
 *
 * The merchant's record is the authoritative source for whether a refund was
 * approved, released, or actually received. The email thread is only what the
 * merchant chose to say.
 */
export function checkRefundStatusTool(ctx: ToolContext) {
  return createInspectTool(
    {
      name: "check_refund_status",
      kind: "REFUND",
      description:
        "Look up the current status of a refund or return case in the merchant's system: whether the return was processed, whether the refund was approved, whether the money was released, and whether it has actually been received. This is the merchant's record, not the email thread. Read `status` against `completeStatus` and `isComplete` before concluding anything.",
      notFoundHint:
        "No refund record matched. Search the mailbox for an order number or the merchant's support address, or ask the account owner which purchase this is about.",
    },
    ctx,
  );
}
