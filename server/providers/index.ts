/**
 * The external-system boundary.
 *
 * `types.ts`  what OpenLoop is allowed to ask of the outside world
 * `simulated.ts`  the demo's implementation, over `server/simulation/`
 *
 * To go live, write a second implementation of these interfaces against real
 * APIs and hand it to the runtime instead. Nothing above this line changes.
 */
export { createSimulatedProviders } from "./simulated";
export type {
  CaseProvider,
  EmailProvider,
  EmailQuery,
  ExternalProviders,
  OutboundEmail,
  ReminderProvider,
} from "./types";
