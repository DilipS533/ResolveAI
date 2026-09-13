import type {
  AgentInfo,
  CreateLoopInput,
  DemoActionKind,
  LoopBundle,
  OpenLoop,
  RunEvent,
  RunStep,
  ExternalWorldSnapshot,
} from "../../shared/types";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export type { LoopBundle };

export interface LoopListItem extends OpenLoop {
  running: boolean;
}

/** Per-case demo verbs, with whether each one can move the case right now. */
export interface CaseActions {
  caseId: string;
  actions: { action: DemoActionKind; available: boolean }[];
}

/**
 * The simulated external world as the client sees it.
 *
 * This is *only* the outside world — cases, mailbox, reminders — plus which
 * loops the monitor considers stale. It deliberately carries no information
 * about what the agent should do, so nothing in the UI can imply the agent's
 * conclusion before the agent reaches it.
 */
export interface SimulationView extends ExternalWorldSnapshot {
  pendingLoops: string[];
  actions: CaseActions[];
}

export interface AgentView extends AgentInfo {
  tools: { name: string; group: string; description: string }[];
}

export interface StreamStep {
  loopId: string;
  runId: string;
  trigger: string;
  model: string;
  startedAt: number;
  steps: RunStep[];
  finished: boolean;
  outcome?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  listLoops: () => request<LoopListItem[]>("/loops"),
  getLoop: (id: string) => request<LoopBundle>(`/loops/${id}`),
  createLoop: (input: CreateLoopInput) =>
    request<LoopBundle>("/loops", { method: "POST", body: JSON.stringify(input) }),
  deleteLoop: (id: string) => request<{ deleted: boolean }>(`/loops/${id}`, { method: "DELETE" }),
  runLoop: (id: string) => request<{ started: boolean }>(`/loops/${id}/run`, { method: "POST" }),
  respondToHuman: (id: string, response: string) =>
    request<LoopBundle>(`/loops/${id}/human-response`, {
      method: "POST",
      body: JSON.stringify({ response }),
    }),
  getSimulation: () => request<SimulationView>("/simulation"),
  demoAction: (action: DemoActionKind, caseId?: string) =>
    request<{
      label: string;
      detail: string;
      advanced: boolean;
      woken: string[];
      simulation: ExternalWorldSnapshot;
    }>("/simulation/action", { method: "POST", body: JSON.stringify({ action, caseId }) }),
  getAgent: () => request<AgentView>("/agent"),
};

/**
 * Subscribe to the server's run event stream.
 *
 * One connection per browser tab carries every agent run, which is what lets
 * the UI show the loop being worked in real time.
 */
export function subscribeToRuns(onEvent: (event: RunEvent) => void): () => void {
  const source = new EventSource(`${BASE}/events`);
  source.onmessage = (message) => {
    try {
      const parsed = JSON.parse(message.data) as RunEvent;
      onEvent(parsed);
    } catch {
      /* ignore malformed frames */
    }
  };
  return () => source.close();
}
