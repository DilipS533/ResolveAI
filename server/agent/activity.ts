import type { ActivityEvent, ActivityKind, LoopStatus, RunStep } from "../../shared/types";
import { newId } from "../util/id";

/**
 * Build a timeline event.
 *
 * `summary` is what a user reads, so keep it in plain language and never
 * include raw model reasoning — only the conclusion the agent reached.
 */
export function activity(
  kind: ActivityKind,
  summary: string,
  options: {
    detail?: string;
    tool?: string;
    at?: number;
    transition?: { from: LoopStatus | null; to: LoopStatus };
  } = {},
): ActivityEvent {
  return {
    id: newId("act"),
    at: options.at ?? Date.now(),
    kind,
    summary,
    ...(options.detail ? { detail: options.detail } : {}),
    ...(options.tool ? { tool: options.tool } : {}),
    ...(options.transition ? { transition: options.transition } : {}),
  };
}

/** A status transition, recorded as its own event type. */
export function stateChange(from: LoopStatus | null, to: LoopStatus, reason?: string): ActivityEvent {
  return activity("STATE", `State changed: ${from ?? "NEW"} → ${to}`, {
    detail: reason,
    transition: { from, to },
    tool: "update_loop",
  });
}

export function step(
  type: RunStep["type"],
  text: string,
  options: { tool?: string; ok?: boolean } = {},
): RunStep {
  return {
    id: newId("step"),
    at: Date.now(),
    type,
    text,
    ...(options.tool ? { tool: options.tool } : {}),
    ...(options.ok === undefined ? {} : { ok: options.ok }),
  };
}
