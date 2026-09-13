import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * A labelled row in a record.
 *
 * The pattern the whole interface leans on: a small caps label, a value, and a
 * hairline between rows. Grouping comes from typography and rules rather than
 * from nesting everything in its own bordered box.
 */
export function Field({
  label,
  children,
  mono = false,
  className,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[80px_minmax(0,1fr)] gap-x-4 border-t border-line-faint py-2.5 first:border-t-0",
        className,
      )}
    >
      <dt className="field-label pt-0.5">{label}</dt>
      <dd className={cn("min-w-0 text-body text-ink-800", mono && "font-mono text-micro")}>
        {children}
      </dd>
    </div>
  );
}

/** A titled group of fields. */
export function Group({
  title,
  children,
  aside,
  className,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between">
        <h2 className="field-label">{title}</h2>
        {aside}
      </div>
      <dl className="mt-1.5 border-t border-line">{children}</dl>
    </section>
  );
}
