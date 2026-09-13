import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ActivityEvent, LoopStatus } from "../../shared/types";
import { ACTIVITY, STATUS_META } from "../lib/status";
import { cn } from "../lib/utils";
import { dayLabel, logStamp } from "../lib/format";
import { ActivitySkeleton, EmptyState, ErrorState } from "../components/states";
import { Button } from "../components/ui/button";
import { Segmented } from "../components/ui/field";
import { StatusDot } from "../components/StatusTag";
import { useWorkspace } from "../state/workspace";

/** One persisted event, with the outcome it belongs to. */
interface Entry {
  loopId: string;
  loopTitle: string;
  status: LoopStatus;
  event: ActivityEvent;
}

const FILTERS = ["ALL", "OPEN", "NEEDS_HUMAN", "RESOLVED"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The workspace-wide activity log.
 *
 * This is the same persisted event stream shown on each outcome, read across
 * every loop and ordered newest first. It is not a separate feed with its own
 * invented content — each row names the outcome it came from.
 */
export function Activity() {
  const { loops, loading, error, refresh } = useWorkspace();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [retrying, setRetrying] = useState(false);

  const entries = useMemo<Entry[]>(() => {
    const rows = loops.flatMap((loop) =>
      loop.activityLog.map((event) => ({
        loopId: loop.id,
        loopTitle: loop.title,
        status: loop.status,
        event,
      })),
    );
    const scoped = rows.filter((row) => {
      if (filter === "ALL") return true;
      if (filter === "OPEN") return row.status !== "RESOLVED";
      return row.status === filter;
    });
    return scoped.sort((a, b) => b.event.at - a.event.at);
  }, [loops, filter]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-page font-medium">Activity</h1>
          <p className="mt-1.5 max-w-[68ch] text-body text-ink-500">
            Everything the agent has done across every outcome, newest first. Each entry is a
            persisted event produced by a real operation.
          </p>
        </div>
        <Segmented value={filter} options={FILTERS} onChange={setFilter} ariaLabel="Filter activity" />
      </div>

      {error && (
        <ErrorState
          className="mt-6"
          message={error}
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            void refresh().finally(() => setRetrying(false));
          }}
        />
      )}

      <div className="sheet mt-7 px-4 py-2 sm:px-5">
        {loading ? (
          <ActivitySkeleton />
        ) : entries.length === 0 ? (
          loops.length === 0 ? (
            <EmptyState
              className="py-5"
              label="No history yet"
              title="Nothing has happened yet."
              body="Every tool the agent calls, every observation it makes and every status it commits is recorded here. Hand over an outcome and this page becomes its operational history."
            >
              <Link to="/app/new">
                <Button variant="primary" size="sm">
                  Create an outcome
                </Button>
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              className="py-5"
              label="No matches"
              title="No activity in this filter."
              body="Nothing has been recorded against outcomes in this state. The agent only writes here when something actually happens, so an empty filter means an empty filter — not a missing log."
            >
              <Button variant="secondary" size="sm" onClick={() => setFilter("ALL")}>
                Show all activity
              </Button>
            </EmptyState>
          )
        ) : (
          <ol>
            {entries.map((row, index) => {
              const meta = ACTIVITY[row.event.kind] ?? ACTIVITY.OBSERVATION;
              const previous = entries[index - 1];
              const newDay = !previous || dayLabel(previous.event.at) !== dayLabel(row.event.at);

              return (
                <Fragment key={`${row.loopId}:${row.event.id}`}>
                  {newDay && (
                    <li className="flex items-center gap-3 pt-4 pb-1.5 first:pt-0">
                      <span className="field-label">{dayLabel(row.event.at)}</span>
                      <span className="h-px flex-1 bg-line-faint" />
                    </li>
                  )}

                  <li className="grid grid-cols-[52px_1fr] gap-x-3 border-t border-line-faint py-2.5 first:border-t-0 sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,240px)] sm:gap-x-5">
                    <time
                      className="pt-px text-micro text-ink-400 tnum"
                      dateTime={new Date(row.event.at).toISOString()}
                    >
                      {logStamp(row.event.at)}
                    </time>

                    <div className="min-w-0">
                      <div className="flex items-start gap-2">
                        <meta.Icon
                          className={cn("mt-[3px] size-3 shrink-0", meta.tone)}
                          strokeWidth={1.9}
                          aria-hidden="true"
                        />
                        {row.event.transition ? (
                          <p className="text-body text-ink-800">
                            <span className={cn("font-medium", STATUS_META[row.event.transition.to].text)}>
                              {row.event.transition.from ?? "new"}
                            </span>
                            <span className="mx-1.5 text-ink-400">→</span>
                            <span className="font-medium text-ink-900">{row.event.transition.to}</span>
                          </p>
                        ) : (
                          <p className="text-body leading-snug text-ink-900">{row.event.summary}</p>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pl-5">
                        <span className={cn("text-micro font-medium", meta.tone)}>
                          {meta.label}
                        </span>
                        {row.event.tool && (
                          <span className="text-micro text-ink-400">
                            via <span className="font-mono">{row.event.tool}</span>
                          </span>
                        )}
                      </p>
                    </div>

                    <Link
                      to={`/app/loops/${row.loopId}`}
                      className="col-start-2 flex items-center gap-2 text-micro text-ink-500 hover:text-accent sm:col-start-3 sm:justify-end"
                    >
                      <StatusDot status={row.status} />
                      <span className="truncate">{row.loopTitle}</span>
                    </Link>
                  </li>
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
