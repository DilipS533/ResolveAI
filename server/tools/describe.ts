/**
 * Turn a raw tool invocation into a sentence a non-technical user can read.
 *
 * The run transcript and the loop timeline both use this, so the agent's
 * activity is legible without ever exposing raw model reasoning.
 */
export function describeToolCall(tool: string, input: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>;
  const str = (key: string): string | undefined => {
    const value = args[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  switch (tool) {
    case "search_email": {
      const query = str("query");
      const from = str("from");
      if (query && from) return `Searched the mailbox for “${query}” from ${from}`;
      if (query) return `Searched the mailbox for “${query}”`;
      if (from) return `Searched the mailbox for mail from ${from}`;
      return "Searched the mailbox for recent correspondence";
    }
    case "send_email": {
      const to = str("to") ?? "the other party";
      const purpose = str("purpose");
      return purpose ? `Emailed ${to} — ${purpose}` : `Sent an email to ${to}`;
    }
    case "check_refund_status":
      return `Read the refund record for ${str("handle") ?? "this outcome"}`;
    case "check_request_status":
      return `Read the request record for ${str("handle") ?? "this outcome"}`;
    case "check_external_response":
      return `Checked for a reply from ${str("from") ?? "the other party"}`;
    case "create_reminder":
      return `Asked the account owner for input: ${str("question") ?? "needs human help"}`;
    case "update_loop":
      return str("notes") ?? "Updated the loop state";
    default:
      return `Used ${tool}`;
  }
}

/** Short label for the live run transcript's tool chip. */
export function toolLabel(tool: string): string {
  return tool.replace(/_/g, " ");
}
