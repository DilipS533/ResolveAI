import type { ActivityKind, LoopStatus, OpenLoop, RunStep, RunTrigger } from "../../shared/types";
import type { OpenLoopStore } from "../state/store";
import type { ExternalProviders } from "../providers/types";

/**
 * Everything a tool needs. Tools never reach for globals, so they can be
 * unit-tested, reused by a different runtime, or executed remotely by
 * AgentCore without changes.
 *
 * Note what is *not* here: the simulated world. A tool can reach the outside
 * world only through `providers`, so no tool can read or mutate external state
 * in a way a real integration could not.
 */
export interface ToolContext {
  runId: string;
  loopId: string;
  trigger: RunTrigger;
  store: OpenLoopStore;
  /** The agent's only view of the outside world. */
  providers: ExternalProviders;
  /** Stream a progress step to the UI and into the persisted run transcript. */
  emit: (step: RunStep) => void;
  /** Append a durable timeline event to the open loop. */
  logActivity: (
    kind: ActivityKind,
    summary: string,
    options?: {
      detail?: string;
      tool?: string;
      transition?: { from: LoopStatus | null; to: LoopStatus };
    },
  ) => void;
  /** Record an explicit status transition. Never inferred by the UI. */
  logStateChange: (from: LoopStatus | null, to: LoopStatus, reason?: string) => void;
  /** Push the latest loop snapshot to any connected client. */
  publishLoop: (loop: OpenLoop) => void;
}

export function currentLoop(ctx: ToolContext): OpenLoop {
  const loop = ctx.store.getLoop(ctx.loopId);
  if (!loop) throw new Error(`Open loop ${ctx.loopId} no longer exists`);
  return loop;
}

/** Round money for display without pulling in a currency library. */
export function money(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}
