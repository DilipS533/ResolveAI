import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LoopPriority } from "../../shared/types";
import { Button } from "../components/ui/button";
import { Input, Segmented } from "../components/ui/field";
import { useWorkspace } from "../state/workspace";

const EXAMPLES = [
  "Make sure my $184.99 refund from Acme Electronics gets resolved.",
  "Make sure my school recommendation request gets completed.",
  "Make sure the invoice I submitted actually gets paid.",
  "Make sure my apartment application gets a decision.",
];

const PRIORITIES: readonly LoopPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

/**
 * Handing over an outcome.
 *
 * One line in, one button out. This deliberately is not a chat: there is no
 * transcript, no greeting, no assistant bubble. The sentence becomes a durable
 * obligation and the agent starts on it immediately.
 */
export function NewLoop() {
  const navigate = useNavigate();
  const { createLoop } = useWorkspace();
  const [outcome, setOutcome] = useState("");
  const [priority, setPriority] = useState<LoopPriority>("NORMAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (outcome.trim().length < 8) {
      setError("Describe the outcome in a few more words — OpenLoop needs something to aim at.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createLoop({ outcome: outcome.trim(), priority });
      navigate(`/app/loops/${id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the outcome");
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[720px]">
      <h1 className="text-page font-medium">What should OpenLoop make sure gets done?</h1>
      <p className="mt-2 max-w-[62ch] text-body leading-relaxed text-ink-500">
        Describe the result you want, not the steps. OpenLoop works out who it is about and what would
        count as done, then takes responsibility for it until it is resolved.
      </p>

      <div className="mt-6 border-t border-line pt-5">
        <label htmlFor="outcome" className="field-label">
          The outcome
        </label>
        <Input
          id="outcome"
          autoFocus
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          placeholder="Make sure my $184.99 refund from Acme Electronics gets resolved."
          className="mt-2 h-11 text-read"
          aria-invalid={Boolean(error)}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-2.5">
            <span className="field-label">Priority</span>
            <Segmented value={priority} options={PRIORITIES} onChange={setPriority} ariaLabel="Priority" />
          </div>
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void submit()}>
            {busy ? "Taking ownership…" : "Take ownership"}
            <ArrowRight />
          </Button>
        </div>

        {error && (
          <p className="mt-3 border-l-2 border-state-risk bg-state-risk-soft px-3 py-2 text-body text-ink-800">
            {error}
          </p>
        )}

        <p className="mt-3 text-micro leading-relaxed text-ink-400">
          The agent starts the moment you hand it over. Its first pass — and everything after it —
          appears on the outcome&apos;s activity log.
        </p>
      </div>

      <div className="mt-8 border-t border-line pt-4">
        <p className="field-label">Examples</p>
        <ul className="mt-2">
          {EXAMPLES.map((example) => (
            <li key={example} className="border-b border-line-faint last:border-b-0">
              <button
                type="button"
                onClick={() => setOutcome(example)}
                className="w-full py-2 text-left text-body text-ink-600 transition-colors duration-75 hover:text-accent"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
