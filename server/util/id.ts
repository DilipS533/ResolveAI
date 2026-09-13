import { randomUUID } from "node:crypto";

/** Prefixed, short, sortable-ish identifier. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO timestamp `days` days in the past (negative moves forward). */
export function isoDaysFromNow(days: number, from: number = Date.now()): string {
  return new Date(from - days * MS_PER_DAY).toISOString();
}

/** ISO timestamp at midnight UTC `days` days in the past. */
export function dateOnlyDaysFromNow(days: number, from: number = Date.now()): string {
  const d = new Date(from - days * MS_PER_DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / MS_PER_DAY);
}
