import { Link } from "react-router-dom";
import type { LoopListItem } from "../lib/api";
import { cn } from "../lib/utils";
import { outcomeMeta, relativeTime } from "../lib/format";
import { STATUS_META } from "../lib/status";
import { StatusTag } from "./StatusTag";

/**
 * One outcome, as a dense operational row.
 *
 * Left: what the outcome is, where it stands, and what the agent is doing or
 * waiting on. Right: the last thing that actually happened, and when. Rows are
 * separated by hairlines — no container, no border, no shadow per outcome.
 */
export function LoopRow({ loop, className }: { loop: LoopListItem; className?: string }) {
  const last = loop.activityLog[loop.activityLog.length - 1];
  const meta = outcomeMeta(loop);
  const current = loop.waitingFor ?? loop.currentState ?? loop.nextAction;
  const state = STATUS_META[loop.status];

  return (
    <Link
      to={`/app/loops/${loop.id}`}
      className={cn(
        "group relative grid grid-cols-1 gap-y-2 border-b border-line px-3 py-3.5 transition-colors duration-75",
        "border-l-2 hover:bg-surface focus-visible:bg-surface",
        "md:grid-cols-[minmax(0,1fr)_minmax(0,268px)] md:gap-x-8",
        state.rule,
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate text-title font-medium text-ink-900 transition-colors duration-75 group-hover:text-accent">
            {loop.title}
          </h3>
          {loop.priority !== "NORMAL" && (
            <span
              className={cn(
                "shrink-0 text-micro font-medium uppercase",
                loop.priority === "URGENT" || loop.priority === "HIGH"
                  ? "text-state-risk"
                  : "text-ink-400",
              )}
            >
              {loop.priority}
            </span>
          )}
        </div>
        {meta && <p className="mt-0.5 truncate font-mono text-micro text-ink-500 tnum">{meta}</p>}

        <div className="mt-2 flex items-center gap-2">
          {loop.running ? (
            <span className="inline-flex items-center gap-1.5 text-micro font-medium text-state-active">
              <span className="live-dot size-1.5 rounded-full bg-state-active" aria-hidden="true" />
              Working
            </span>
          ) : (
            <StatusTag status={loop.status} />
          )}
        </div>

        <p className="mt-1 max-w-[68ch] truncate text-body text-ink-700" title={current ?? undefined}>
          {current ?? "No state recorded yet."}
        </p>
      </div>

      <div className="min-w-0 md:text-right">
        <div className="flex items-baseline justify-between gap-3 md:justify-end">
          <span className="field-label">Last activity</span>
          <span className="font-mono text-micro text-ink-500 tnum">
            {last ? relativeTime(last.at) : "—"}
          </span>
        </div>
        <p className="mt-1 flex flex-col text-body text-ink-700 md:items-end">
          <span className="truncate" title={last?.summary}>
            {last?.summary ?? "Nothing recorded yet"}
          </span>
        </p>
        {last?.tool && (
          <p className="mt-0.5 truncate font-mono text-micro text-ink-400 md:text-right">
            {last.tool}
          </p>
        )}
      </div>
    </Link>
  );
}
