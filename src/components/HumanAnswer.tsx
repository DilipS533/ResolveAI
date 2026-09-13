import { useState } from "react";
import type { OpenLoop } from "../../shared/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/field";

/**
 * Answering a question the agent genuinely cannot answer itself.
 *
 * The agent commits a specific question to the loop when it is blocked. This
 * records the owner's reply on that loop; the agent then picks the outcome back
 * up on its own run. Nothing here decides the loop's status.
 */
export function HumanAnswer({
  loop,
  onRespond,
  compact = false,
}: {
  loop: OpenLoop;
  onRespond: (value: string) => Promise<void>;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  if (!loop.humanRequest) return null;

  return (
    <div>
      <p className="max-w-[75ch] text-body leading-relaxed text-ink-800">
        {loop.humanRequest.question}
      </p>
      {!compact && loop.humanRequest.reason && (
        <p className="mt-1 max-w-[75ch] text-micro leading-relaxed text-ink-500">
          {loop.humanRequest.reason}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Textarea
          rows={2}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Your answer — OpenLoop uses it and carries on."
          className="sm:flex-1"
          aria-label={`Answer for ${loop.title}`}
        />
        <Button
          variant="primary"
          className="sm:self-end"
          disabled={busy || !value.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onRespond(value.trim());
              setValue("");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sending…" : "Send answer"}
        </Button>
      </div>
    </div>
  );
}
