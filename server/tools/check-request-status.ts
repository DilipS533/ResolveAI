import type { ToolContext } from "./context";
import { createInspectTool } from "./inspect-case";

/**
 * check_request_status — the document/application system's side of the story.
 *
 * Covers anything where a person or institution owes you a document, a
 * decision, or a submission: a recommendation letter, a permit, a claim, an
 * application. Someone saying "it's submitted" is not the university saying
 * "it's received" — this record is where that difference is visible.
 */
export function checkRequestStatusTool(ctx: ToolContext) {
  return createInspectTool(
    {
      name: "check_request_status",
      kind: "DOCUMENT_REQUEST",
      description:
        "Look up the current status of a document, application, or submission request with the organisation handling it: whether the request was acknowledged, whether the document was produced, whether it was submitted, and whether the receiving organisation has actually confirmed it. Read `status` against `completeStatus` and `isComplete` before concluding anything.",
      notFoundHint:
        "No document or application request matched. Search the mailbox for the request thread or the reference number, or ask the account owner who this was requested from.",
    },
    ctx,
  );
}
