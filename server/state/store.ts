import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentRun, LoopPriority, OpenLoop, RunStep, ExternalWorldState } from "../../shared/types";
import { SimulatedWorld } from "../simulation/world";
import { createSimulatedWorld } from "../simulation/cases";
import { createSimulatedProviders } from "../providers/simulated";
import type { ExternalProviders } from "../providers/types";
import { newId } from "../util/id";
import { activity } from "../agent/activity";

const SCHEMA_VERSION = 1;

interface Database {
  version: number;
  createdAt: number;
  updatedAt: number;
  world: ExternalWorldState;
  loops: OpenLoop[];
  runs: AgentRun[];
}

function emptyDatabase(): Database {
  const now = Date.now();
  return {
    version: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    world: createSimulatedWorld(now),
    loops: [],
    runs: [],
  };
}

export interface CreateLoopOptions {
  title: string;
  desiredOutcome: string;
  description: string;
  priority?: LoopPriority;
  deadline?: number | null;
  completionCriteria?: string[];
  relevantEntities?: OpenLoop["relevantEntities"];
  context?: OpenLoop["context"];
  status?: OpenLoop["status"];
  nextAction?: string | null;
}

/**
 * Single-writer JSON store.
 *
 * Deliberately boring: the whole dataset is small, and a synchronous atomic
 * write after each mutation makes the "the agent remembers unfinished
 * outcomes" guarantee obvious and debuggable. Swapping this for DynamoDB or
 * Postgres later only requires reimplementing this class.
 */
export class OpenLoopStore {
  private data: Database;
  private world: SimulatedWorld;
  private external: ExternalProviders | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly file: string;

  private constructor(file: string, data: Database) {
    this.file = file;
    this.data = data;
    this.world = new SimulatedWorld(this.data.world, () => this.markDirty());
  }

  static open(file = resolve(process.cwd(), "data/openloop.json")): OpenLoopStore {
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as Database;
        if (parsed?.version === SCHEMA_VERSION && parsed.world && parsed.loops) {
          return new OpenLoopStore(file, parsed);
        }
        console.warn(`[openloop] ignoring incompatible store at ${file}; starting a fresh one`);
      } catch (error) {
        console.warn(`[openloop] could not read store at ${file}:`, error);
      }
    }
    return new OpenLoopStore(file, emptyDatabase());
  }

  /* ---------------------------------------------------------------- *
   * Persistence
   * ---------------------------------------------------------------- */

  markDirty(): void {
    this.data.updatedAt = Date.now();
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 250);
    // Never hold the process open just to flush.
    this.saveTimer.unref?.();
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const dir = dirname(this.file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    renameSync(tmp, this.file);
  }

  /* ---------------------------------------------------------------- *
   * The outside world
   *
   * Two accessors, deliberately distinct:
   *
   *   simulation()  the simulated environment itself — seeding, demo verbs,
   *                 snapshots for the developer panel. Dev/demo tooling only.
   *   providers()   the interfaces the agent and its tools are given. Tools
   *                 never receive the concrete world, so they cannot reach past
   *                 the provider contract even by accident.
   * ---------------------------------------------------------------- */

  simulation(): SimulatedWorld {
    return this.world;
  }

  providers(): ExternalProviders {
    if (!this.external) this.external = createSimulatedProviders(this.world);
    return this.external;
  }

  /* ---------------------------------------------------------------- *
   * Loops
   * ---------------------------------------------------------------- */

  listLoops(): OpenLoop[] {
    return [...this.data.loops].sort((a, b) => {
      if (a.status === "RESOLVED" && b.status !== "RESOLVED") return 1;
      if (b.status === "RESOLVED" && a.status !== "RESOLVED") return -1;
      return b.updatedAt - a.updatedAt;
    });
  }

  getLoop(id: string): OpenLoop | undefined {
    return this.data.loops.find((l) => l.id === id);
  }

  createLoop(options: CreateLoopOptions): OpenLoop {
    const now = Date.now();
    const loop: OpenLoop = {
      id: newId("loop"),
      title: options.title,
      desiredOutcome: options.desiredOutcome,
      description: options.description,
      status: options.status ?? "ACTIVE",
      priority: options.priority ?? "NORMAL",
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      nextAction: options.nextAction ?? "Investigate the current state of this outcome",
      lastAction: null,
      waitingFor: null,
      currentState: "OpenLoop has just taken ownership of this outcome and is gathering evidence.",
      deadline: options.deadline ?? null,
      nextCheckAt: now,
      activityLog: [
        activity("CREATED", "OpenLoop took ownership of this outcome", {
          detail: options.desiredOutcome,
        }),
      ],
      relevantEntities: options.relevantEntities ?? [],
      completionCriteria: options.completionCriteria ?? [],
      context: options.context ?? {},
      humanRequest: null,
      resolutionSummary: null,
      runCount: 0,
      lastRunAt: null,
      lastObservedRevision: 0,
    };
    this.data.loops.push(loop);
    this.markDirty();
    return loop;
  }

  patchLoop(id: string, patch: Partial<OpenLoop>): OpenLoop | undefined {
    const loop = this.getLoop(id);
    if (!loop) return undefined;
    Object.assign(loop, patch, { updatedAt: Date.now() });
    this.markDirty();
    return loop;
  }

  appendActivity(id: string, entries: OpenLoop["activityLog"]): OpenLoop | undefined {
    const loop = this.getLoop(id);
    if (!loop) return undefined;
    loop.activityLog.push(...entries);
    loop.updatedAt = Date.now();
    this.markDirty();
    return loop;
  }

  deleteLoop(id: string): boolean {
    const before = this.data.loops.length;
    this.data.loops = this.data.loops.filter((l) => l.id !== id);
    if (this.data.loops.length !== before) {
      this.markDirty();
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- *
   * Runs
   * ---------------------------------------------------------------- */

  createRun(input: { loopId: string; model: string; trigger: AgentRun["trigger"] }): AgentRun {
    const run: AgentRun = {
      id: newId("run"),
      loopId: input.loopId,
      startedAt: Date.now(),
      finishedAt: null,
      model: input.model,
      outcome: "IN_PROGRESS",
      trigger: input.trigger,
      steps: [],
      error: null,
    };
    this.data.runs.push(run);
    // Keep the run history bounded.
    if (this.data.runs.length > 400) {
      this.data.runs = this.data.runs.slice(-300);
    }
    this.markDirty();
    return run;
  }

  appendRunStep(runId: string, step: RunStep): void {
    const run = this.data.runs.find((r) => r.id === runId);
    if (!run) return;
    run.steps.push(step);
    this.markDirty();
  }

  finishRun(
    runId: string,
    patch: { outcome: AgentRun["outcome"]; error?: string | null },
  ): AgentRun | undefined {
    const run = this.data.runs.find((r) => r.id === runId);
    if (!run) return undefined;
    run.finishedAt = Date.now();
    run.outcome = patch.outcome;
    run.error = patch.error ?? null;
    this.markDirty();
    return run;
  }

  runsForLoop(loopId: string): AgentRun[] {
    return this.data.runs
      .filter((r) => r.loopId === loopId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /* ---------------------------------------------------------------- *
   * Bulk access
   * ---------------------------------------------------------------- */

  worldRevision(): number {
    return this.world.revision;
  }
}
