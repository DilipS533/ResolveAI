import type { LoopStatus } from "../../shared/types";
import type { OpenLoopStore } from "../state/store";
import { activity } from "./activity";
import type { AgentRuntime } from "./runtime";

/** Statuses the monitor is allowed to wake up on its own. */
const MONITORABLE: LoopStatus[] = ["ACTIVE", "WAITING", "AT_RISK"];

/**
 * The heartbeat that makes "it stays on it" true rather than aspirational.
 *
 * A loop is only woken when the external world has actually changed since the
 * agent last looked at it. That keeps the agent from buzzing on unchanged
 * state while still guaranteeing it notices the moment something moves.
 */
export class LoopMonitor {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly store: OpenLoopStore,
    private readonly runtime: AgentRuntime,
    private readonly intervalMs: number,
  ) {}

  get enabled(): boolean {
    return process.env.OPENLOOP_MONITOR !== "off";
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer.unref?.();
    console.log(`[openloop] monitor running every ${this.intervalMs}ms`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Which loops have unseen external changes right now. */
  pendingLoops() {
    const revision = this.store.providers().revision;
    return this.store
      .listLoops()
      .filter(
        (loop) =>
          MONITORABLE.includes(loop.status) &&
          loop.lastObservedRevision !== revision &&
          !this.runtime.isRunning(loop.id),
      );
  }

  /** Returns the ids of loops that were woken. */
  async tick(): Promise<string[]> {
    if (this.ticking) return [];
    this.ticking = true;
    try {
      const pending = this.pendingLoops();
      for (const loop of pending) {
        const label = this.store.providers().lastChangeLabel;
        console.log(`[openloop] waking loop ${loop.id} — external change: ${label}`);
        // The monitor records that it noticed; it never decides what the
        // change means. That is the agent's job, on the run below.
        this.store.appendActivity(loop.id, [
          activity("INVESTIGATE", "The outside world changed — waking this loop to re-check", {
            detail: label,
          }),
        ]);
        await this.runtime.run(loop.id, "world_change").catch((error) => {
          console.error(`[openloop] monitor run failed for ${loop.id}`, error);
        });
      }
      return pending.map((loop) => loop.id);
    } finally {
      this.ticking = false;
    }
  }
}
