import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

/**
 * Loading, empty and error surfaces.
 *
 * These are content-shaped on purpose: a skeleton mirrors the row it will be
 * replaced by, so the page does not jump when data lands, and an empty or
 * failed screen says what happened and what to do about it rather than
 * "Loading…" or "No data".
 */

/** One skeleton bar. Widths differ per row so the shape reads as content. */
/**
 * One skeleton bar.
 *
 * `raised` rather than `sunken`: in the light theme the two are the same value,
 * but on a dark ground a sunken bar would be all but invisible — the placeholder
 * has to sit *above* the page, not below it.
 */
function Bar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-raised", className)} />;
}

/**
 * Skeleton rows shaped like the outcome list: title, identifying meta, status
 * line, state line, and the right-hand last-activity column.
 */
export function OutcomeListSkeleton({ rows = 3 }: { rows?: number }) {
  const widths = [
    ["w-[44%]", "w-[26%]", "w-[16%]", "w-[58%]", "w-[72%]"],
    ["w-[38%]", "w-[32%]", "w-[20%]", "w-[66%]", "w-[58%]"],
    ["w-[50%]", "w-[22%]", "w-[14%]", "w-[52%]", "w-[64%]"],
  ];

  return (
    <div className="mt-1" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => {
        const [title, meta, status, state, last] = widths[index % widths.length];
        return (
          <div
            key={index}
            className="grid grid-cols-1 gap-y-2 border-b border-line border-l-2 border-l-line px-3 py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,268px)] md:gap-x-8"
          >
            <div className="min-w-0">
              <Bar className={cn("h-4", title)} />
              <Bar className={cn("mt-2 h-3 bg-raised/70", meta)} />
              <Bar className={cn("mt-2.5 h-3 bg-raised/70", status)} />
              <Bar className={cn("mt-1.5 h-3.5 bg-raised/60", state)} />
            </div>
            <div className="min-w-0 md:flex md:flex-col md:items-end">
              <Bar className="h-3 w-[42%] bg-raised/70" />
              <Bar className={cn("mt-2 h-3.5 bg-raised/60", last)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Skeleton log lines, matching the activity log's time/summary grid. */
export function ActivitySkeleton({ rows = 5 }: { rows?: number }) {
  const widths = ["w-[62%]", "w-[74%]", "w-[48%]", "w-[68%]", "w-[56%]"];
  return (
    <ol className="py-1" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <li
          key={index}
          className="grid grid-cols-[52px_1fr] items-baseline gap-x-3 border-t border-line-faint py-2.5 first:border-t-0 sm:grid-cols-[64px_1fr] sm:gap-x-5"
        >
          <Bar className="h-3 w-[38px]" />
          <div className="min-w-0">
            <Bar className={cn("h-3.5", widths[index % widths.length])} />
            <Bar className="mt-1.5 h-3 w-[24%] bg-raised/70" />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Skeleton for the outcome record: header, record lines, activity. */
export function RecordSkeleton() {
  return (
    <div aria-hidden="true">
      <Bar className="h-3 w-[64px] bg-raised/70" />
      <Bar className="mt-4 h-6 w-[42%]" />
      <Bar className="mt-2.5 h-3 w-[24%] bg-raised/70" />

      <div className="mt-5 border-y border-line py-3">
        <Bar className="h-3.5 w-[52%]" />
      </div>

      <div className="mt-8 grid gap-x-12 gap-y-9 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="min-w-0">
          <Bar className="h-4 w-[96px] bg-raised/80" />
          <dl className="mt-2 border-t border-line">
            {[
              "w-[78%]",
              "w-[54%]",
              "w-[42%]",
              "w-[36%]",
            ].map((width, index) => (
              <div
                key={index}
                className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-5 border-t border-line-faint py-3 first:border-t-0 sm:grid-cols-[104px_minmax(0,1fr)]"
              >
                <Bar className="h-3 w-[56px] bg-raised/70" />
                <Bar className={cn("h-3.5 bg-raised/60", width)} />
              </div>
            ))}
          </dl>

          <div className="mt-9">
            <Bar className="h-4 w-[80px] bg-raised/80" />
            <div className="mt-2 border-t border-line pt-1.5">
              <ActivitySkeleton rows={4} />
            </div>
          </div>
        </div>

        <div className="space-y-7">
          {[0, 1].map((group) => (
            <div key={group}>
              <Bar className="h-3 w-[68px] bg-raised/80" />
              <div className="mt-1.5 border-t border-line">
                {[0, 1, 2].map((row) => (
                  <div
                    key={row}
                    className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-4 border-t border-line-faint py-2.5 first:border-t-0"
                  >
                    <Bar className="h-3 w-[52px] bg-raised/70" />
                    <Bar className="h-3.5 w-[64%] bg-raised/60" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * An intentionally designed empty state: what this screen is for, and the one
 * action worth taking. Sits on the page's own hairlines rather than in a card.
 */
export function EmptyState({
  label,
  title,
  body,
  children,
  className,
}: {
  label: string;
  title: string;
  body: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-[68ch] border-t border-line pt-7", className)}>
      <p className="field-label">{label}</p>
      <h2 className="mt-2 text-heading font-medium text-ink-900">{title}</h2>
      <p className="mt-1.5 text-body leading-[1.6] text-ink-500">{body}</p>
      {children && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>}
    </div>
  );
}

/**
 * A failure the user can act on. Says what broke, how bad it is, and offers the
 * one recovery that exists.
 */
export function ErrorState({
  title = "The workspace did not respond",
  message,
  hint,
  onRetry,
  retrying = false,
  className,
}: {
  title?: string;
  message?: string | null;
  hint?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 border border-line border-l-2 border-l-state-risk bg-surface px-3.5 py-3",
        className,
      )}
    >
      <AlertTriangle className="mt-px size-3.5 shrink-0 text-state-risk" strokeWidth={2} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-micro font-medium text-ink-900">{title}</p>
        {message && <p className="mt-0.5 text-body leading-snug text-ink-700">{message}</p>}
        <p className="mt-1 text-micro leading-relaxed text-ink-500">
          {hint ?? "The agent keeps working on its outcomes; this screen just could not read them."}
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" disabled={retrying} onClick={onRetry}>
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      )}
    </div>
  );
}
