import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createApiServer } from "./api/server";
import { EventBus } from "./agent/events";
import { LoopMonitor } from "./agent/monitor";
import { AgentRuntime } from "./agent/runtime";
import { OpenLoopService } from "./agent/service";
import { OpenLoopStore } from "./state/store";

const PORT = Number(process.env.OPENLOOP_AGENT_PORT ?? process.env.PORT ?? 8787);
const MONITOR_INTERVAL_MS = Number(process.env.OPENLOOP_MONITOR_INTERVAL_MS ?? 5000);

const store = OpenLoopStore.open(process.env.OPENLOOP_DATA_FILE);
const bus = new EventBus();
const runtime = new AgentRuntime(store, bus);
const service = new OpenLoopService(store, runtime);
const monitor = new LoopMonitor(store, runtime, MONITOR_INTERVAL_MS);

const distDir = resolve(process.cwd(), "dist");
const server = createApiServer({
  store,
  runtime,
  service,
  bus,
  monitor,
  staticDir: existsSync(distDir) ? distDir : undefined,
});

server.listen(PORT, "0.0.0.0", async () => {
  const model = await runtime.getModel();
  const external = store.providers();
  console.log("");
  console.log("  OpenLoop agent runtime");
  console.log(`  → listening on http://0.0.0.0:${PORT}`);
  console.log(`  → model: ${model.provider}/${model.modelId}`);
  if (model.simulated) console.log("    (no LLM credentials found — using the deterministic policy model)");
  console.log(`  → open loops: ${store.listLoops().length}`);
  console.log(`  → external world revision: ${external.revision} (${external.lastChangeLabel})`);
  console.log("");
  monitor.start();
});

function shutdown(signal: string): void {
  console.log(`\n[openloop] ${signal} received — flushing state and exiting`);
  monitor.stop();
  store.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
