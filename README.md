# OpenLoop

**Give an outcome. We'll stay on it.**

OpenLoop is an autonomous agent that takes ownership of unfinished outcomes and keeps working them until they are actually resolved.

People start things that require waiting on other people or systems — a refund, a reply, a document, an application decision, a teammate, a confirmation — and then they forget. A to-do list only reminds you. A chatbot only tells you what to do. Neither takes the outcome off your plate.

OpenLoop lets you hand over the *result*:

> "Make sure my $184.99 refund from Acme Electronics gets resolved."

It then takes responsibility for that open loop:

```
understand → investigate → act → wait → monitor → interpret → act again → verify → resolve
```

The defining property is that **`WAITING` does not mean the agent forgot.** It means the agent has done everything it currently can, has named the exact external event it is blocked on, and is monitoring for the next state change.

---

## What it is not

- Not a to-do list
- Not a calendar
- Not a chatbot
- Not a reminder app
- Not a generic AI assistant

There is no chat surface. The primary interaction is **outcome → agent ownership**. The primary screen is a board of open loops the agent has taken responsibility for.

---

## Quick start

Requires **Bun ≥ 1.1** (or Node ≥ 22 with an equivalent TypeScript runner).

```bash
bun install
bun run dev
```

This starts two processes:

| Process | Command | Default port | Purpose |
| --- | --- | --- | --- |
| Agent API | `bun run dev:agent` | `8787` | Strands agent, tools, state, simulated world |
| Web client | `bun run dev:web` | `5173` | Vite + React app, proxies `/api` to the agent |

Open <http://localhost:5173>.

**No API keys are required.** With no model credentials configured, OpenLoop runs on its deterministic policy model against the simulated environment — see [Model selection](#model-selection).

### Other scripts

```bash
bun run demo     # all three end-to-end paths in the terminal (no UI)
bun run smoke    # boots the real API and asserts the whole flow over HTTP + SSE
bun run typecheck
bun run build && bun run start   # build the client; the API serves it from dist/
bun run reset    # wipe persistent state
```

---

## The demos

Two complete, reliable end-to-end scenarios ship with the repository. Both take under a minute, and both run on the same agent, the same tools, and the same loop model — only the external record differs.

### 1. Acme Electronics refund — a promise is not a payment

1. Open `/app` and click **Start both demo outcomes** (or go to **New** and describe your own).
2. The agent takes ownership immediately: it searches the mailbox, reads the merchant's refund record, and discovers the refund is **15 days overdue**.
3. It writes a follow-up demanding a specific date, then commits `WAITING` with a named dependency.
4. Open the **Demo controls** panel (bottom-right, deliberately styled as a developer instrument), pick the case, and advance the outside world:

   | Control | What it does to the selected case |
   | --- | --- |
   | **Counterparty replies** | mail arrives that does not change the record |
   | **Counterparty needs information** | blocks the case on something only you have |
   | **Advance one milestone** | moves the record one step along its own chain |
   | **Run to the final milestone** | takes the record straight to the outcome |
   | **Reset the world** | every case back to its seed state |

   These are generic verbs, not hand-written buttons for one scenario. The panel renders each case's own milestone chain and steps it forward; it has no idea what "APPROVED" means.

5. You do **not** tell the agent what happened. Within a few seconds the monitor notices the external revision changed, wakes the loop, and the agent re-runs.

Watch it refuse to close the loop early — this is the real timeline, produced by tool calls:

```
[OBSERVATION]    Acme Electronics refund: pending approval
[ACTION]         Sent an email to support@acmeelectronics.com
[INTERPRETATION] The record says it is waiting for Acme's finance team to approve the refund
[WAITING]        Monitoring: Acme's finance team to approve the refund
[STATE]          ACTIVE → WAITING
[OBSERVATION]    Acme Electronics refund: approved
[INTERPRETATION] A reply is not progress
[WAITING]        Monitoring: Acme to release the approved funds to the original payment method
[OBSERVATION]    Acme Electronics refund: issued
[WAITING]        Monitoring: The credit to post to the original payment method
[OBSERVATION]    Acme Electronics refund: received
[RESOLVED]       Outcome verified and resolved
[STATE]          ACTIVE → RESOLVED
```

### 2. Northgate recommendation letter — submitted is not received

The same agent handles an outcome in a completely different external system: a counsellor who owes a university recommendation.

- **Delivered path.** Advance the record through `DRAFTED → SUBMITTED → RECEIVED`. The agent chases the letter, then refuses to accept "I've uploaded it to the portal" as done — it waits for *the university* to confirm receipt on the application checklist before resolving.
- **Blocked path.** Click **Counterparty needs information** and the counsellor asks for the applicant ID and upload link. No tool can produce those, so the agent escalates to `NEEDS_HUMAN` with a specific question and stops acting.

**Third path: no reachable record.** In *New*, enter an outcome with no matching external record, e.g. *"Make sure the contract I sent to Northwind Legal gets signed and returned."* The agent searches, finds nothing, and escalates with a question instead of inventing state.

```bash
bun run demo   # all three paths end to end, printed as they happen
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend            src/                                        │
│  React · Tailwind · react-router                                 │
│  Landing · Dashboard · Loop detail · Create flow · Demo controls │
└───────────────────────────────┬──────────────────────────────────┘
                                │  REST + Server-Sent Events
┌───────────────────────────────▼──────────────────────────────────┐
│  OpenLoop API        server/api/server.ts                        │
│  Thin HTTP layer — validates, delegates, streams run events      │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│  Agent runtime       server/agent/                               │
│  service.ts   create a loop · record the owner's answer           │
│  runtime.ts   one Strands agent cycle per loop                   │
│  model.ts     Bedrock | OpenAI | Anthropic | policy              │
│  prompt.ts    the agent's charter and per-run brief              │
│  policy-model.ts  a Strands Model that needs no credentials      │
│  monitor.ts   wakes loops when the outside world changes         │
│  intake.ts    sentence → structured loop                         │
└───────────┬───────────────────────────────┬──────────────────────┘
            │                               │
┌───────────▼──────────────┐   ┌────────────▼─────────────────────┐
│  Tools   server/tools/   │   │  State   server/state/store.ts   │
│  search_email            │   │  Durable open loops, run         │
│  send_email              │   │  transcripts, world snapshot     │
│  check_refund_status     │   │  Atomic single-writer JSON store │
│  check_request_status    │   └────────────┬─────────────────────┘
│  check_external_response │                │
│  create_reminder         │   ┌────────────▼─────────────────────┐
│  update_loop             │   │  External providers  providers/  │
└──────────────────────────┘   │  EmailProvider · CaseProvider    │
                               │  ReminderProvider                │
                               │  The agent's only view of the    │
                               │  outside world — no tool can     │
                               │  reach past this contract        │
                               └────────────┬─────────────────────┘
                                            │  implemented by
                               ┌────────────▼─────────────────────┐
                               │  Simulated systems  simulation/  │
                               │  mailbox · data-driven cases     │
                               │  Mutable only by the demo verbs  │
                               │  in POST /api/simulation/action  │
                               └──────────────────────────────────┘
```

Layers only talk downward. The frontend never reaches the agent directly, the agent never touches the store without a tool, and **the agent only ever sees `ExternalProviders`** — it cannot reach the simulated world, and neither can a tool. Production would swap `server/providers/simulated.ts` for HTTP-backed implementations of the same interfaces; nothing above that line changes.

```
shared/types.ts   the contract between all three layers (no runtime deps)
```

### Directory map

```
server/
  index.ts                  bootstrap: store → runtime → monitor → HTTP
  api/server.ts             routes, SSE stream, static client
  agent/
    service.ts              the application service: create a loop, answer one
    runtime.ts              runs one Strands agent cycle over a loop
    model.ts                model selection
    policy-model.ts         deterministic Strands Model (no credentials)
    prompt.ts               system prompt + per-run brief
    intake.ts               natural-language outcome → structured loop
    monitor.ts              external-change heartbeat
    events.ts               pub/sub for run events
    activity.ts             timeline/step builders
  providers/
    types.ts                EmailProvider · CaseProvider · ReminderProvider
    simulated.ts            those interfaces over server/simulation/
    index.ts                the boundary the agent is given
  tools/
    index.ts                registry — add a tool here and nowhere else
    context.ts              the ToolContext tools are given
    inspect-case.ts         one "read the external record" contract
    search-email.ts         send-email.ts
    check-refund-status.ts  check-request-status.ts
    check-external-response.ts
    create-reminder.ts      update-loop.ts
    describe.ts             tool call → readable sentence
  state/store.ts            durable store
  simulation/
    world.ts                the simulated external systems (implementation)
    cases.ts                scenario seed data (milestones as data)
src/
  pages/                    Landing, Dashboard, NewLoop, LoopDetail,
                            Activity, Settings
  components/               AppShell, LoopRow, ActivityLog, RunTranscript,
                            StatusTag, Record, HumanAnswer, DemoPanel, ui
  state/workspace.tsx       loops + simulation + live run stream
  lib/                      api client, status metadata, formatting
scripts/
  demo.ts                   CLI end-to-end run of the whole loop
  smoke-api.ts              HTTP + SSE assertions
  reset.ts                  clear persistent state
```

---

## The interface

The client renders backend state and nothing else. It has no seed data, no fallback
content, and no fabricated rows: if a value is not in the store it is not on screen.

Three rules keep it honest:

1. **Every activity row is a persisted event** (`loop.activityLog`), produced by a tool
   that actually ran or a transition the agent actually committed. The frontend never
   appends to the timeline and never invents a step.
2. **Status is never computed in the browser.** `ACTIVE` / `WAITING` / `NEEDS_HUMAN` /
   `AT_RISK` / `RESOLVED` are fields the agent wrote through `update_loop`. The client
   only maps them to a colour and a label.
3. **A live run is a real run.** The transcript under an outcome is the SSE stream of
   the in-flight Strands cycle — tool calls and results as the SDK emitted them. There
   is no typing indicator, no progress percentage, and no thinking animation anywhere.

Visually the system is deliberately restrained, in the idiom of operational software:
a fixed left rail and a working surface, hairline rules doing the structural work, one
accent, and semantic status colours.

**It ships dark, and theme is a token layer rather than a second stylesheet.** Every
colour in the interface is a semantic role (`canvas`, `surface`, `sunken`, `raised`,
`ink-*`, `line-*`, `accent`, `state-*`) resolved to a CSS variable declared once per
theme in `src/index.css`. Components never name a colour, so no component carries a
`dark:` variant, and the theme is applied to `<html>` before first paint by a two-line
script in `index.html` — the light theme is a preference (`localStorage`, toggled from
the rail or the marketing header), dark is the default.

- **Navigation** is one short rail (Outcomes, Activity, Settings) with live counts, plus
a compact bar below `lg`. The rail footer reports the runtime the workspace is actually
running rather than decorating it.
- **An outcome is a row, not a card.** The dashboard is a filtered list — real status
tabs with real counts — where each row carries the outcome, its status, what the agent
is waiting on, and the last action with its timestamp.
- **The detail page is a record**: the committed state on a status band, then the
labelled blocks a person needs (asked for · current state · next action · waiting for ·
completion), then the activity log and prior runs, with timing and memory in a narrow
metadata rail.
- **Creating an outcome is a command, not a conversation** — one line in, one button out.

The only shared patterns are `.sheet` (a bordered surface for logs and forms),
`.record-row`, and `.elevate` / `.float-shadow` (elevation, which is also themed: on a
dark ground a shadow reads as a soft edge of the surface). Everything else is
typography, alignment, and whitespace. Roles live in `tailwind.config.js`, values in
`src/index.css`.

Contrast is a build-time property, not a hope: every load-bearing token clears **4.5:1**
against the canvas, the surface *and* the recessed band in both themes (measured, not
asserted — the numbers are recorded above the token blocks in `src/index.css`). The only
token allowed below that is `ink-400`, which is documented as subordinate metadata.

---

## The agent

The agent is built on the **AWS Strands Agents SDK** (`@strands-agents/sdk`). A run looks like:

1. The runtime loads the `OpenLoop` **from persistent state** — not from process memory.
2. It builds a `ToolContext` and registers the tools.
3. It creates a Strands `Agent` and invokes it with a per-run brief containing the loop, its memory, the last external change, and previous runs.
4. Strands runs its loop: model → tool call → tool result → model → … until the model stops.
5. Hooks observe content blocks and tool calls to produce the live run transcript.
6. `update_loop` commits status, current state, next action, what it is waiting for, and the timeline. That commit *is* the loop's survival.

Nothing about the outcome lives only in the model's context window. A run can be interrupted, restarted, or triggered days later and the agent resumes from committed state.

### Model selection

`server/agent/model.ts` resolves the model at startup:

| Condition | Provider |
| --- | --- |
| `OPENLOOP_MODEL` set | that provider, explicitly |
| Bedrock credentials present (`AWS_*`, incl. `AWS_BEARER_TOKEN_BEDROCK`) | **Amazon Bedrock** |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| nothing configured | **policy** — the deterministic model |

The **policy model** (`server/agent/policy-model.ts`) is a real `Model` implementation for Strands, not a mock of the agent. The agent loop, the tool registry, tool execution, message history, and hooks are all genuinely Strands — only the component that *decides the next move* changes. It reads the conversation, extracts what the tools actually returned, and branches on observed state, including escalating honestly when there is nothing to work with.

That is why the demo is reliable on any machine with no keys, and why pointing `OPENLOOP_MODEL=bedrock` gives you an LLM-driven agent with no other code change.

### Tools

Every capability is a registered tool with a Zod-validated schema, and every tool talks to the outside world only through `ExternalProviders` (`server/providers/types.ts`). Adding a real integration means implementing a provider against the real API and pointing one tool at it — the runtime, the reasoning, the loop model and the UI stay the same.

| Tool | Group | What it does |
| --- | --- | --- |
| `search_email` | Observe | Search the owner's mailbox for correspondence and confirmations |
| `check_refund_status` | Observe | Read a merchant's authoritative refund record |
| `check_request_status` | Observe | Read a document/application record and its receiving system |
| `check_external_response` | Observe | Detect whether the other side has replied, marking new mail as read |
| `send_email` | Act | Write into the external environment, inside a watchable thread |
| `create_reminder` | Escalate | Hand a decision only a human can make back to the owner |
| `update_loop` | Commit | Persist status, waiting-on, memory, and the activity timeline |

The two inspection tools are the same code with different configuration, and both return the same normalized `CaseView`:

```ts
{ found, caseId, kind, reference, status, statusMeaning, nextStep,
  completeStatus, isComplete, isOverdue, daysOverdue,
  informationRequest, note, facts, timeline }
```

That shape is the whole trick. The agent never branches on `refundStatus === 'APPROVED'` or any scenario-specific field — it compares `status` against `completeStatus`, reads `isOverdue`, and watches for `nextStep`. Adding a third external system does not touch the agent at all.

In the refund case the milestones are deliberately `PENDING_APPROVAL → APPROVED → ISSUED → RECEIVED`, because "approved" is not "paid" and "released" is not "received". In the letter case they are `REQUESTED → ACKNOWLEDGED → DRAFTED → SUBMITTED → RECEIVED`, because a counsellor saying "uploaded" is not a university saying "received". The agent has to reason across both, with no code that knows either word.

---

## The OpenLoop data model

```ts
interface OpenLoop {
  id, title, desiredOutcome, description
  status:         ACTIVE | WAITING | NEEDS_HUMAN | AT_RISK | RESOLVED
  priority:       LOW | NORMAL | HIGH | URGENT
  createdAt, updatedAt, resolvedAt
  nextAction      // what the agent will do next
  lastAction      // the last thing it actually did
  waitingFor      // the named external event it is blocked on
  currentState    // plain language: what is true right now
  deadline, nextCheckAt
  activityLog     // chronological actions, observations, interpretations
  relevantEntities, completionCriteria
  context         // agent-owned memory: thread ids, case ids, amounts, refs
  humanRequest    // set when status is NEEDS_HUMAN
  resolutionSummary
  runCount, lastRunAt, lastObservedRevision
}
```

`context` is deliberately loose (`Record<string, string|number|boolean|null>`) so the agent can persist whatever handles it discovers without a schema migration. It is surfaced in the UI as **Agent memory**, which is the clearest evidence that state is genuinely carried between runs.

### Status semantics

| Status | Meaning |
| --- | --- |
| `ACTIVE` | The agent is working it right now |
| `WAITING` | Everything possible is done; monitoring a named external event (**not** forgotten) |
| `NEEDS_HUMAN` | Genuinely blocked on the owner; autonomous action paused |
| `AT_RISK` | No progress and the deadline is close or passed |
| `RESOLVED` | The outcome was *observed* as achieved, not promised |

---

## The simulated external environment

`server/simulation/` is a small, mutable external system: a mailbox, a set of cases (each carrying its own milestone chain, meanings, deadlines and notification emails), and reminders. It behaves like a real system in the only way that matters — **the agent can only learn about it through tools, and it only changes when the world changes.**

Mechanically:

- Every mutation bumps `world.revision` and records a human-readable change label.
- Each loop stores `lastObservedRevision`.
- `server/agent/monitor.ts` ticks every few seconds and wakes only loops where `world.revision !== loop.lastObservedRevision` and the status is `ACTIVE`, `WAITING`, or `AT_RISK`.
- `NEEDS_HUMAN` loops are never woken automatically — that is a genuine pause.
- Demo verbs move a case along *its own* chain and post the notification its data says arrives. Nothing in the world knows what the agent will conclude.

So when you click **Advance one milestone**, nothing tells the agent. The revision moves, the monitor notices, and the agent re-establishes the facts itself. One HTTP `POST` to the API proves the same thing headlessly (`bun run smoke`).

Three details exist specifically so the simulation cannot flatter the agent:

- **Intake and tools match on whole terms, not substrings**, so the word "returned" in an unrelated sentence cannot bind an outcome to the refund case. The outcome is matched on counterparty, reference and keywords — and a record of the right *kind* is never substituted just because it is the only one on file. If no record matches, the agent is told nothing matched; it is not shown someone else's case.
- **The world's public snapshot (what the client reads) contains external state only** — statuses, milestones, mail. It carries no `nextAction`, `waitingFor`, or conclusion. The UI physically cannot show a state the agent has not reached.
- **A case that moves on clears the information request it was blocked on**, so a resolved blocker cannot keep a case looking stuck.

### Adding a third scenario

1. Add a `CaseRecord` to `server/simulation/cases.ts` — milestones, meanings, `nextStep` per milestone, `dueBy`, `onEnter` transitions with their notification emails, and `outcomeKeywords`.
2. If it needs a genuinely different external system, copy `check-request-status.ts` and point it at a new `CaseKind`.
3. Register the tool in `server/tools/index.ts`.

No agent logic, no runtime logic, and no client code changes. The demo panel renders the new case's chain automatically.

---

## API

All routes are under `/api`. The client discovers everything through these; nothing is hardcoded.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/agent` | Resolved model, tool catalog, monitor config |
| `GET` | `/api/loops` | All open loops, with live `running` flags |
| `POST` | `/api/loops` | `{ outcome }` → intake → create → agent takes ownership |
| `GET` | `/api/loops/:id` | Loop + run history + running state |
| `DELETE` | `/api/loops/:id` | Delete a loop |
| `POST` | `/api/loops/:id/run` | Force an agent pass now |
| `POST` | `/api/loops/:id/human-response` | `{ response }` → resume an escalated loop |
| `GET` | `/api/simulation` | Snapshot of the simulated world |
| `POST` | `/api/simulation/action` | Advance the simulated world (demo controls) |
| `GET` | `/api/events` | Server-Sent Events: `run_started`, `step`, `loop_updated`, `run_finished` |
| `GET` | `/api/health` | Liveness |

State is persisted to `data/openloop.json` (atomic write, single writer). Delete it or run `bun run reset` for a fresh world.

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENLOOP_MODEL` | `auto` | `policy` \| `bedrock` \| `openai` \| `anthropic` \| `auto` |
| `OPENLOOP_AGENT_PORT` | `8787` | Agent API port |
| `OPENLOOP_DATA_FILE` | `./data/openloop.json` | Store location |
| `OPENLOOP_MONITOR` | `on` | Set to `off` to disable automatic waking |
| `OPENLOOP_MONITOR_INTERVAL_MS` | `5000` | Monitoring tick interval |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BEARER_TOKEN_BEDROCK` | — | Bedrock credentials |
| `BEDROCK_MODEL_ID` | `global.anthropic.claude-sonnet-4-6` | Bedrock model |
| `OPENAI_API_KEY`, `OPENAI_MODEL_ID` | — | OpenAI |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_ID` | — | Anthropic |
| `VITE_API_BASE` | `/api` | Client API base, if not same-origin |
| `PORT` | `5173` | Vite dev/preview port |

Secrets stay server-side. Nothing model-related is ever read by the client.

---

## Verification

```bash
bun run typecheck   # tsc -b --noEmit across client and server
bun run smoke       # boots the API and asserts the full flow over HTTP + SSE
bun run demo        # runs the whole agent loop and prints the timeline
```

`bun run smoke` boots the real HTTP server and asserts, among other things:

- intake grounds the loop in a real external record, and produces completion criteria;
- the agent investigates unprompted and calls tools on its own;
- **a reply is not progress** — a stalling email leaves the dependency unchanged;
- **approval is not payment, and release is not receipt** — the loop stays open through both;
- the loop only reaches `RESOLVED` after the credit posts;
- the loop, its timeline and its memory survive a store reload from disk;
- **a second, unrelated outcome resolves on the same architecture**, where "submitted" is not mistaken for "received";
- an information blocker escalates, the owner's answer is recorded verbatim, the agent **forwards it and does not ask twice**, and that same loop later reaches `RESOLVED`;
- an outcome with no reachable record escalates to `NEEDS_HUMAN`, and that pause is real: further world changes do not wake it;
- every run event type is actually streamed over SSE;
- the world snapshot the UI reads carries external state only.

---

## Path to AWS

The layering exists so this can become a production system without a rewrite.

| Today | Production |
| --- | --- |
| `server/agent/model.ts` → policy/OpenAI | **Amazon Bedrock** — already supported, just set credentials |
| `server/index.ts` on a single host | API Gateway + Lambda, or ECS/Fargate |
| `server/state/store.ts` → JSON file | DynamoDB (loops, runs) + S3 (artifacts) |
| `server/agent/monitor.ts` → `setInterval` | **EventBridge Scheduler** invoking a monitoring Lambda per loop |
| Long-lived process per run | **AWS Bedrock AgentCore** runtime for agent sessions |
| `server/providers/simulated.ts` | Implement the same interfaces against real APIs — Gmail/Graph, Stripe, merchant APIs. The agent and its tools are unchanged |
| `server/agent/events.ts` → in-process | EventBridge → API Gateway WebSocket for live updates |

Reimplementing `OpenLoopStore` and replacing the simulated world with real tool implementations are the only two substantial pieces of work. The agent, its tools contract, the domain model, the status semantics, and the entire client survive unchanged.

### What is intentionally not built yet

Real email/payment integrations, authentication and multi-tenancy, scheduled (rather than change-triggered) wake-ups, and the AgentCore deployment itself. The simulated environment is the deliberate stand-in for real integrations: it is reachable only through `server/providers/`, and mutable only from the demo control panel, so it cannot leak into the agent or the product surface. `grep` is a fair test — no file under `server/agent/` or `server/tools/` references `server/simulation/`.
