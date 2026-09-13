import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CreateLoopInput, DemoActionKind, OpenLoop, RunEvent, RunStep } from "../../shared/types";
import { api, subscribeToRuns, type AgentView, type LoopListItem, type SimulationView, type StreamStep } from "../lib/api";

interface WorkspaceValue {
  loops: LoopListItem[];
  agent: AgentView | null;
  simulation: SimulationView | null;
  /** The run currently streaming, if any. */
  stream: StreamStep | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
  createLoop: (input: CreateLoopInput) => Promise<string>;
  runLoop: (id: string) => Promise<void>;
  respond: (id: string, response: string) => Promise<void>;
  removeLoop: (id: string) => Promise<void>;
  demoAction: (action: DemoActionKind, caseId?: string) => Promise<string>;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

function upsert(list: LoopListItem[], loop: OpenLoop, running?: boolean): LoopListItem[] {
  const existing = list.find((item) => item.id === loop.id);
  const merged: LoopListItem = {
    ...loop,
    running: running ?? existing?.running ?? false,
  };
  if (!existing) return [...list, merged];
  return list.map((item) => (item.id === loop.id ? merged : item));
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [loops, setLoops] = useState<LoopListItem[]>([]);
  const [agent, setAgent] = useState<AgentView | null>(null);
  const [simulation, setSimulation] = useState<SimulationView | null>(null);
  const [stream, setStream] = useState<StreamStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clearTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextLoops, info, sim] = await Promise.all([
        api.listLoops(),
        api.getAgent(),
        api.getSimulation(),
      ]);
      setLoops(nextLoops);
      setAgent(info);
      setSimulation(sim);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach the OpenLoop agent");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSimulation = useCallback(async () => {
    try {
      setSimulation(await api.getSimulation());
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeToRuns((event: RunEvent) => {
      switch (event.type) {
        case "run_started": {
          if (clearTimer.current) {
            window.clearTimeout(clearTimer.current);
            clearTimer.current = null;
          }
          setStream({
            loopId: event.loopId,
            runId: event.runId,
            trigger: event.trigger,
            model: event.model,
            startedAt: event.at,
            steps: [],
            finished: false,
          });
          setLoops((current) => current.map((item) => (item.id === event.loopId ? { ...item, running: true } : item)));
          break;
        }
        case "step": {
          setStream((current) => {
            if (!current || current.runId !== event.runId) {
              return {
                loopId: "",
                runId: event.runId,
                trigger: "manual",
                model: "",
                startedAt: event.step.at,
                steps: [event.step],
                finished: false,
              };
            }
            return { ...current, steps: [...current.steps, event.step] };
          });
          break;
        }
        case "loop_updated": {
          setLoops((current) => upsert(current, event.loop));
          break;
        }
        case "run_finished": {
          setLoops((current) => upsert(current, event.loop, false));
          setStream((current) =>
            current && current.runId === event.runId
              ? { ...current, finished: true, outcome: event.outcome }
              : current,
          );
          void refreshSimulation();
          clearTimer.current = window.setTimeout(() => setStream(null), 2600);
          break;
        }
      }
    });
    return () => {
      unsubscribe();
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
    };
  }, [refreshSimulation]);

  const createLoop = useCallback(
    async (input: CreateLoopInput) => {
      const bundle = await api.createLoop(input);
      setLoops((current) => upsert(current, bundle.loop, true));
      return bundle.loop.id;
    },
    [],
  );

  const runLoop = useCallback(async (id: string) => {
    setLoops((current) => current.map((item) => (item.id === id ? { ...item, running: true } : item)));
    try {
      await api.runLoop(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the agent");
      setLoops((current) => current.map((item) => (item.id === id ? { ...item, running: false } : item)));
    }
  }, []);

  const respond = useCallback(async (id: string, response: string) => {
    const bundle = await api.respondToHuman(id, response);
    setLoops((current) => upsert(current, bundle.loop, true));
  }, []);

  const removeLoop = useCallback(async (id: string) => {
    await api.deleteLoop(id);
    setLoops((current) => current.filter((item) => item.id !== id));
  }, []);

  const demoAction = useCallback(
    async (action: DemoActionKind, caseId?: string) => {
      const result = await api.demoAction(action, caseId);
      // Re-read the world rather than trusting the response body, so the panel
      // always reflects what the external systems actually contain now.
      await refreshSimulation();
      return result.detail;
    },
    [refreshSimulation],
  );

  const value = useMemo<WorkspaceValue>(
    () => ({
      loops,
      agent,
      simulation,
      stream,
      loading,
      error,
      clearError: () => setError(null),
      refresh,
      createLoop,
      runLoop,
      respond,
      removeLoop,
      demoAction,
    }),
    [loops, agent, simulation, stream, loading, error, refresh, createLoop, runLoop, respond, removeLoop, demoAction],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

/** All steps belonging to one loop across the live stream. */
export function useStreamForLoop(loopId: string): RunStep[] {
  const { stream } = useWorkspace();
  return useMemo(
    () => (stream && stream.loopId === loopId ? stream.steps : []),
    [stream, loopId],
  );
}
