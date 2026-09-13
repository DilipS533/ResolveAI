import type { OpenLoop } from "../../shared/types";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function isSameDay(a: number, b: number): boolean {
  const left = new Date(a);
  const right = new Date(b);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/** Compact "how long has this been open" label. */
export function openFor(createdAt: number, resolvedAt?: number | null): string {
  const end = resolvedAt ?? Date.now();
  const ms = Math.max(0, end - createdAt);
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

export function relativeTime(at: number): string {
  const delta = Date.now() - at;
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) return `${Math.round(delta / MINUTE)} min ago`;
  if (delta < DAY) return `${Math.round(delta / HOUR)}h ago`;
  const days = Math.round(delta / DAY);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** 24-hour clock time — the format an operations log uses. */
export function absoluteTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Clock time today; a date and time for anything older. */
export function logStamp(at: number): string {
  if (isSameDay(at, Date.now())) return absoluteTime(at);
  return `${new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })}, ${absoluteTime(at)}`;
}

/** "Today", "Yesterday", or a date — for grouping log entries by day. */
export function dayLabel(at: number): string {
  if (isSameDay(at, Date.now())) return "Today";
  if (isSameDay(at, Date.now() - DAY)) return "Yesterday";
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: new Date(at).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** "Tomorrow", "in 3 hours", "now". */
export function nextCheckLabel(at: number | null | undefined): string {
  if (!at) return "Not scheduled";
  const delta = at - Date.now();
  if (delta <= 0) return "Due now";
  if (delta < HOUR) return `in ${Math.max(1, Math.round(delta / MINUTE))} min`;
  if (delta < DAY) return `in ${Math.round(delta / HOUR)} hours`;
  const days = Math.round(delta / DAY);
  if (days === 1) return "tomorrow";
  if (days < 30) return `in ${days} days`;
  return `in ${Math.round(days / 30)} months`;
}

export function deadlineLabel(at: number | null | undefined): string {
  if (!at) return "None set";
  const delta = at - Date.now();
  const date = new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (delta < 0) return `${date} · past`;
  if (delta < DAY) return `${date} · today`;
  return `${date} · in ${Math.round(delta / DAY)} days`;
}

export function money(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

/**
 * The identifying facts of an outcome, taken from what the agent actually
 * recorded about it — an amount, a reference, or the counterparty. Never
 * invented: if the agent has discovered nothing, this is empty.
 */
export function outcomeMeta(loop: OpenLoop): string {
  const parts: string[] = [];
  const { context } = loop;

  const amount = typeof context.amount === "number" ? context.amount : undefined;
  if (amount !== undefined) {
    parts.push(money(amount, typeof context.currency === "string" ? context.currency : "USD"));
  }

  const reference = [
    context.reference,
    context.orderNumber,
    context.applicationReference,
    context.returnReference,
  ].find((value): value is string => typeof value === "string" && value.length > 0);
  if (reference) parts.push(reference);

  const counterparty = [context.counterpartyName, context.counterparty].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (counterparty && !reference) parts.push(counterparty);

  return parts.join(" · ");
}
