/**
 * Wipe persistent state.
 *
 *   bun scripts/reset.ts
 *
 * Removes the store file so the next start begins with a fresh simulated world
 * and no open loops. Deletes nothing else.
 */
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const file = process.env.OPENLOOP_DATA_FILE ?? resolve(process.cwd(), "data/openloop.json");

if (existsSync(file)) {
  rmSync(file);
  console.log(`Removed ${file}`);
} else {
  console.log(`Nothing to remove at ${file}`);
}
