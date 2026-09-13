import type { RunEvent } from "../../shared/types";

/**
 * Minimal in-process pub/sub for run events.
 *
 * The HTTP layer turns these into Server-Sent Events. Swapping this for
 * EventBridge later is a one-file change — nothing else knows how events move.
 */
export class EventBus {
  private readonly subscribers = new Set<(event: RunEvent) => void>();

  subscribe(listener: (event: RunEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  publish(event: RunEvent): void {
    for (const listener of [...this.subscribers]) {
      try {
        listener(event);
      } catch (error) {
        console.error("[openloop] event subscriber failed", error);
      }
    }
  }
}
