import { cn } from "../lib/utils";

/**
 * An open ring: a loop that is not closed yet.
 *
 * Monochrome and geometric — a product mark, not an "AI" badge.
 */
export function LoopGlyph({
  className,
  closed = false,
}: {
  className?: string;
  closed?: boolean;
}) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={cn("size-4", className)} aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray={closed ? undefined : "26 9"}
        transform="rotate(-58 8 8)"
      />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LoopGlyph className="size-4 text-accent" />
      {!compact && (
        <span className="text-[18px] font-semibold leading-none tracking-[-0.02em] text-ink-900">
          OpenLoop
        </span>
      )}
    </span>
  );
}
