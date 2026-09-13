import { Fragment } from "react";
import type { ActivityEvent } from "../../shared/types";
import { ACTIVITY } from "../lib/status";
import { cn } from "../lib/utils";
import { dayLabel, logStamp } from "../lib/format";

/**
 * The activity log.
 *
 * Every row is a persisted event produced by a real operation: a tool that ran,
 * a state transition the agent committed, an external change it noticed. There
 * are no conversational bubbles, no invented reasoning steps, and no rows the
 * frontend made up — if it is not in `loop.activityLog`, it is not here.
 */
export function ActivityLog({
  entries,
  className,
  emptyLabel = "No activity recorded yet.",
  groupByDay = true,
}: {
  entries: ActivityEvent[];
  className?: string;
  emptyLabel?: string;
  groupByDay?: boolean;
}) {
  if (entries.length === 0) {
    return <p className={cn("py-8 text-center text-body text-ink-400", className)}>{emptyLabel}</p>;
  }

  const ordered = [...entries].sort((a, b) => b.at - a.at);

  return (
    <ol className={cn("text-left", className)}>
      {ordered.map((entry, index) => {
        const meta = ACTIVITY[entry.kind] ?? ACTIVITY.OBSERVATION;
        const previous = ordered[index - 1];
        const newDay = groupByDay && (!previous || dayLabel(previous.at) !== dayLabel(entry.at));

        return (
          <Fragment key={entry.id}>
            {newDay && (
              <li className="flex items-center gap-3 pt-4 pb-1.5 first:pt-0">
                <span className="field-label">{dayLabel(entry.at)}</span>
                <span className="h-px flex-1 bg-line-faint" />
              </li>
            )}

            <li className="grid grid-cols-[52px_1fr] gap-x-3 border-t border-line-faint py-2.5 first:border-t-0 sm:grid-cols-[60px_1fr] sm:gap-x-4">
              <time
                className="pt-px font-mono text-micro text-ink-500 tnum"
                dateTime={new Date(entry.at).toISOString()}
              >
                {logStamp(entry.at)}
              </time>

              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <meta.Icon
                    className={cn("mt-[3px] size-3 shrink-0", meta.tone)}
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                  {entry.transition ? (
                    <p className="text-body text-ink-800">
                      <span className={cn("font-medium", STATUS_TEXT(entry))}>
                        {entry.transition.from ?? "new"}
                      </span>
                      <span className="mx-1.5 text-ink-400">→</span>
                      <span className="font-medium text-ink-900">{entry.transition.to}</span>
                    </p>
                  ) : (
                    <p className="text-body leading-snug text-ink-900">{entry.summary}</p>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pl-5">
                  <span className={cn("text-micro font-medium", meta.tone)}>{meta.label}</span>
                  {entry.tool && (
                    <span className="font-mono text-micro text-ink-500">via {entry.tool}</span>
                  )}
                </div>

                {entry.detail && (
                  <p className="mt-1 max-w-[70ch] pl-5 text-micro leading-relaxed text-ink-500">
                    {entry.detail}
                  </p>
                )}
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/** The destination status of a transition, coloured semantically. */
function STATUS_TEXT(entry: ActivityEvent): string {
  switch (entry.transition?.to) {
    case "ACTIVE":
      return "text-state-active";
    case "WAITING":
      return "text-state-waiting";
    case "NEEDS_HUMAN":
      return "text-state-human";
    case "AT_RISK":
      return "text-state-risk";
    case "RESOLVED":
      return "text-state-resolved";
    default:
      return "text-ink-600";
  }
}
