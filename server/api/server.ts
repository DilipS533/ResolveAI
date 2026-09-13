import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import type {
  CreateLoopInput,
  DemoActionRequest,
  LoopBundle,
  OpenLoop,
  RunEvent,
} from "../../shared/types";
import type { OpenLoopService } from "../agent/service";
import type { AgentRuntime } from "../agent/runtime";
import type { EventBus } from "../agent/events";
import type { LoopMonitor } from "../agent/monitor";
import type { OpenLoopStore } from "../state/store";
import { TOOL_CATALOG } from "../tools";

export interface ApiDependencies {
  store: OpenLoopStore;
  runtime: AgentRuntime;
  service: OpenLoopService;
  bus: EventBus;
  monitor: LoopMonitor;
  /** Directory holding the built SPA, when running in production. */
  staticDir?: string;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new HttpError(413, "Request body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {} as T;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new HttpError(400, "Request body is not valid JSON");
  }
}

function bundle(store: OpenLoopStore, runtime: AgentRuntime, loop: OpenLoop): LoopBundle {
  return {
    loop,
    runs: store.runsForLoop(loop.id),
    running: runtime.isRunning(loop.id),
  };
}

/**
 * The OpenLoop API.
 *
 * Deliberately thin: it validates input, calls the agent runtime, and reads
 * the store. No business logic lives here, which is what makes swapping this
 * for API Gateway + Lambda (or AgentCore) a deployment change rather than a
 * rewrite.
 */
export function createApiServer(deps: ApiDependencies): Server {
  const { store, runtime, service, bus, monitor, staticDir } = deps;

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    void (async () => {
      /* ------------------------------------------------------------ *
       * Streaming: live agent run events
       * ------------------------------------------------------------ */
      if (path === "/api/events" && method === "GET") {
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        const send = (event: RunEvent | { type: string; [key: string]: unknown }) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        };
        send({ type: "hello", at: Date.now() });
        const unsubscribe = bus.subscribe(send);
        const heartbeat = setInterval(() => res.write(": ping\n\n"), 20_000);
        heartbeat.unref?.();
        req.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
        return;
      }

      if (!path.startsWith("/api/")) {
        if (staticDir) return serveStatic(staticDir, path, res);
        throw new HttpError(404, "Not found");
      }

      /* ------------------------------------------------------------ *
       * Health & metadata
       * ------------------------------------------------------------ */
      if (path === "/api/health" && method === "GET") {
        return json(res, 200, { ok: true, loops: store.listLoops().length, at: Date.now() });
      }

      if (path === "/api/agent" && method === "GET") {
        const info = await runtime.info();
        return json(res, 200, { ...info, tools: TOOL_CATALOG });
      }

      /* ------------------------------------------------------------ *
       * Simulation controls
       * ------------------------------------------------------------ */      if (path === "/api/simulation" && method === "GET") {
        const world = store.simulation();
        return json(res, 200, {
          ...world.snapshot(),
          pendingLoops: monitor.pendingLoops().map((loop) => loop.id),
          actions: world.listCases().map((simCase) => ({
            caseId: simCase.id,
            actions: world.demoActionsFor(simCase.id),
          })),
        });
      }

      if (path === "/api/simulation/action" && method === "POST") {
        const body = await readJson<DemoActionRequest>(req);
        if (!body?.action) throw new HttpError(400, "action is required");
        const world = store.simulation();
        const result = world.applyDemoAction(body);
        store.flush();
        // Broadcast that the outside world moved. Nothing about *meaning* is
        // sent — the agent has to go and find that out.
        bus.publish({
          type: "world_updated",
          at: Date.now(),
          revision: world.revision,
          label: world.raw().lastChangeLabel,
        });
        // Let the monitor notice, then sweep immediately so the demo is snappy.
        const woken = await monitor.tick();
        return json(res, 200, {
          ...result,
          woken,
          actions: result.caseId ? world.demoActionsFor(result.caseId) : [],
          simulation: world.snapshot(),
        });
      }

      /* ------------------------------------------------------------ *
       * Open loops
       * ------------------------------------------------------------ */
      if (path === "/api/loops" && method === "GET") {
        return json(
          res,
          200,
          store.listLoops().map((loop) => ({
            ...loop,
            running: runtime.isRunning(loop.id),
          })),
        );
      }

      if (path === "/api/loops" && method === "POST") {
        const body = await readJson<CreateLoopInput>(req);
        const outcome = (body.outcome ?? "").trim();
        if (outcome.length < 8) {
          throw new HttpError(400, "Describe the outcome in at least a few words.");
        }

        // One creation path, shared with the CLI demo and the smoke test.
        const { loop } = await service.createFromOutcome({
          outcome,
          priority: body.priority,
          deadline: body.deadline,
        });
        return json(res, 201, bundle(store, runtime, loop));
      }

      const loopMatch = path.match(/^\/api\/loops\/([^/]+)$/);
      if (loopMatch) {
        const loopId = decodeURIComponent(loopMatch[1]);
        const loop = store.getLoop(loopId);
        if (!loop) throw new HttpError(404, "Open loop not found");

        if (method === "GET") return json(res, 200, bundle(store, runtime, loop));
        if (method === "DELETE") {
          store.deleteLoop(loopId);
          store.flush();
          return json(res, 200, { deleted: true, id: loopId });
        }
      }

      const runMatch = path.match(/^\/api\/loops\/([^/]+)\/run$/);
      if (runMatch && method === "POST") {
        const loopId = decodeURIComponent(runMatch[1]);
        if (!store.getLoop(loopId)) throw new HttpError(404, "Open loop not found");
        void runtime.run(loopId, "manual").catch((error) => {
          console.error("[openloop] manual run failed", error);
        });
        return json(res, 202, { started: true, loopId });
      }

      const humanMatch = path.match(/^\/api\/loops\/([^/]+)\/human-response$/);
      if (humanMatch && method === "POST") {
        const loopId = decodeURIComponent(humanMatch[1]);
        const loop = store.getLoop(loopId);
        if (!loop) throw new HttpError(404, "Open loop not found");
        const body = await readJson<{ response?: string }>(req);
        const response = (body.response ?? "").trim();
        if (!response) throw new HttpError(400, "response is required");

        // The service records the owner's answer and lets the agent decide what
        // it means — the transport never writes an agent-authored field.
        const updated = await service.respondToHuman(loopId, response);
        return json(res, 202, bundle(store, runtime, updated));
      }

      throw new HttpError(404, `No route for ${method} ${path}`);
    })().catch((error: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof HttpError) {
        json(res, error.status, { error: error.message });
        return;
      }
      console.error("[openloop] request failed", error);
      json(res, 500, { error: error instanceof Error ? error.message : "Internal error" });
    });
  });
}

function serveStatic(root: string, pathname: string, res: ServerResponse): void {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = resolve(join(root, safe));
  if (!filePath.startsWith(resolve(root))) filePath = resolve(join(root, "index.html"));
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback so client-side routes deep-link correctly.
    filePath = resolve(join(root, "index.html"));
  }
  if (!existsSync(filePath)) {
    json(res, 404, { error: "Not found" });
    return;
  }
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    "content-length": body.length,
  });
  res.end(body);
}
