import type { LoopStatus } from "../../shared/types";
import { STATUS_META } from "../lib/status";
import { cn } from "../lib/utils";
import { relativeTime } from "../lib/format";

/**
 * A status is a dot and a word.
 *
 * The container stays neutral for every state except NEEDS_HUMAN, which is the
 * only one that should pull the eye — a person is required for progress.
 */
export function StatusTag({
  status,
  className,
  updatedAt,
}: {
  status: LoopStatus;
  className?: string;
  updatedAt?: number;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-micro font-medium",
        meta.text,
        className,
      )}
      title={updatedAt ? `${meta.meaning} Updated ${relativeTime(updatedAt)}.` : meta.meaning}
    >
      <span className={cn("size-[7px] shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function StatusDot({ status, className }: { status: LoopStatus; className?: string }) {
  const meta = STATUS_META[status];
  return <span className={cn("inline-block size-1.5 rounded-full", meta.dot, className)} />;
}
