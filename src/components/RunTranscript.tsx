import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { RunStep } from "../../shared/types";
import { cn } from "../lib/utils";
import { absoluteTime } from "../lib/format";

function StepRow({ step }: { step: RunStep }) {
  if (step.type === "final") {
    return (
      <li className="border-t border-line-faint py-2.5 pl-3 first:border-t-0">
        <p className="max-w-[80ch] border-l border-line-strong pl-3 text-body leading-relaxed text-ink-800">
          {step.text}
        </p>
      </li>
    );
  }

  if (step.type === "thought") {
    return (
      <li className="grid grid-cols-[46px_1fr] gap-x-3 py-1.5 first:border-t-0">
        <span />
        <p className="text-body leading-relaxed text-ink-600">{step.text}</p>
      </li>
    );
  }

  const isCall = step.type === "tool_call";
  return (
    <li className="grid grid-cols-[46px_1fr] items-baseline gap-x-3 border-t border-line-faint py-1.5 first:border-t-0">
      <time className="font-mono text-micro text-ink-500 tnum">{absoluteTime(step.at)}</time>
      <p className="min-w-0 text-body leading-snug">
        <span
          className={cn(
            "mr-2 font-mono text-micro",
            isCall ? "text-accent" : step.ok === false ? "text-state-risk" : "text-ink-300",
          )}
          aria-hidden="true"
        >
          {isCall ? "→" : "←"}
        </span>
        <span className={isCall ? "text-ink-900" : "text-ink-500"}>{step.text}</span>
      </p>
    </li>
  );
}

/**
 * The live transcript of one agent run.
 *
 * These are the real steps the Strands agent produced in this process — tool
 * calls, tool results, and whatever the model said — streamed over SSE as they
 * happened. The header count and timestamps come from the same source.
 */
export function RunTranscript({
  steps,
  running,
  model,
  className,
}: {
  steps: RunStep[];
  running: boolean;
  model?: string;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className={cn("sheet overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100 hover:bg-raised"
        aria-expanded={!collapsed}
      >
        <ChevronRight
          className={cn("size-3.5 text-ink-400 transition-transform duration-150", !collapsed && "rotate-90")}
          aria-hidden="true"
        />
        <span className="text-micro font-medium text-ink-700">Run transcript</span>
        {running && (
          <span className="inline-flex items-center gap-1.5 text-micro text-state-active">
            <span className="live-dot size-1.5 rounded-full bg-state-active" aria-hidden="true" />
            live
          </span>
        )}
        <span className="ml-auto text-micro text-ink-400 tnum">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
        {model && <span className="hidden font-mono text-micro text-ink-400 sm:inline">{model}</span>}
      </button>

      {!collapsed && (
        <div className="border-t border-line px-3 py-2">
          {steps.length === 0 ? (
            <p className="py-2 text-micro text-ink-400">
              No steps yet — waiting on the model&apos;s first response.
            </p>
          ) : (
            <ol>
              {steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
