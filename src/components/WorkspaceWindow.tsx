import { ArrowRight, Clock, Eye, Search, Send } from "lucide-react";
import { Link } from "react-router-dom";
import type { ActivityEvent, LoopStatus } from "../../shared/types";
import type { LoopListItem } from "../lib/api";
import { ACTIVITY, STATUS_META } from "../lib/status";
import { cn } from "../lib/utils";
import { outcomeMeta, relativeTime } from "../lib/format";
import { StatusTag } from "./StatusTag";
import { useWorkspace } from "../state/workspace";

/**
 * The workspace, rendered at hero scale.
 *
 * This reads the same store the agent writes to — real outcomes, real statuses,
 * real activity. When the workspace is empty it degrades to a single example
 * outcome that is labelled as one, rather than inventing rows.
 */
export function WorkspaceWindow() {
  const { loops, stream } = useWorkspace();
  const live = loops.length > 0;
  const ordered = [...loops].sort(
    (a, b) => Number(a.status === "RESOLVED") - Number(b.status === "RESOLVED") || b.updatedAt - a.updatedAt,
  );
  const rows = ordered.slice(0, 4);
  const focus = rows.find((loop) => loop.status !== "RESOLVED") ?? rows[0];
  const counts = new Map<string, number>();
  for (const loop of loops) counts.set(loop.status, (counts.get(loop.status) ?? 0) + 1);
  const streaming = Boolean(stream && !stream.finished);
  const open = loops.filter((loop) => loop.status !== "RESOLVED").length;

  return (
    <div className="overflow-hidden rounded-md border border-line-strong bg-surface">
      {/* Window chrome: the same header the app uses, with real counts. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-raised/70 px-3 py-2">
        <p className="text-micro font-medium text-ink-900">Outcomes</p>
        <p className="text-micro text-ink-400 tnum">
          {live ? `${loops.length} total · ${open} open` : "example"}
        </p>
        {live ? (
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-micro">
            {(["ACTIVE", "WAITING", "NEEDS_HUMAN", "RESOLVED"] as LoopStatus[]).map((status) => (
              <span key={status} className="flex items-baseline gap-1">
                <span className="text-ink-500">{STATUS_META[status].label}</span>
                <span className="font-mono text-micro text-ink-500 tnum">
                  {counts.get(status) ?? 0}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-1.5 text-micro text-ink-400">
            <span className="size-1.5 rounded-full bg-ink-300" aria-hidden="true" />
            nothing handed over yet
          </div>
        )}
        {streaming && (
          <span className="inline-flex items-center gap-1.5 text-micro text-state-active">
            <span className="live-dot size-1.5 rounded-full bg-state-active" aria-hidden="true" />
            agent working
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-[132px_minmax(0,1fr)_minmax(0,326px)]">
        {/* Rail — decorative echo of the app shell, so the window reads as the
            product rather than as a table. Hidden on narrow screens. */}
        <div className="hidden border-r border-line bg-sunken/60 p-2 lg:block">
          <p className="px-2 py-1 text-micro font-semibold text-ink-900">OpenLoop</p>
          <ul className="mt-1 space-y-0.5 text-micro">
            {[
              ["Outcomes", live ? String(loops.length) : "3"],
              ["Activity", live ? String(loops.filter((l) => l.status === "ACTIVE").length) : "1"],
            ].map(([label, count]) => (
              <li
                key={label}
                className="flex items-center justify-between gap-2 rounded bg-surface px-2 py-1 text-ink-800"
              >
                {label}
                <span className="text-ink-400 tnum">{count}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-2 px-2 py-1 text-ink-400">Settings</li>
          </ul>
          <p className="mt-2 border-t border-line px-2 pt-2 text-micro text-ink-400">
            {live ? `${open} open` : "no outcomes"}
          </p>
        </div>

        {/* The list. The row whose record is open on the right is shown as
            selected, so the two panes read as one master/detail view. */}
        <div className="min-w-0 border-b border-line lg:border-b-0">
          {live
            ? rows.map((loop) => (
                <LiveRow key={loop.id} loop={loop} selected={loop.id === focus?.id} />
              ))
            : <ExampleRow />}
        </div>

        {/* The selected record */}
        <div className="hidden min-w-0 border-l border-line bg-surface md:block">
          {focus ? <FocusRecord loop={focus} /> : <ExampleFocus />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-raised/70 px-3 py-2">
        <p className="text-micro text-ink-400">
          {live
            ? "Read from the same store the agent writes to."
            : "Example content — hand over an outcome and this becomes the real thing."}
        </p>
        <Link to="/app" className="ml-auto inline-flex items-center gap-1 text-micro text-accent hover:underline">
          Open the workspace
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** A real outcome row. */
function LiveRow({ loop, selected }: { loop: LoopListItem; selected: boolean }) {
  const last = loop.activityLog[loop.activityLog.length - 1];
  const state = STATUS_META[loop.status];
  const current = loop.waitingFor ?? loop.currentState ?? loop.nextAction;
  return (
    <Link
      to={`/app/loops/${loop.id}`}
      className={cn(
        "group block border-b border-line border-l-2 px-3 py-2.5 transition-colors duration-75 last:border-b-0",
        selected ? "bg-sunken" : "bg-surface hover:bg-raised",
        state.rule,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          className={cn(
            "min-w-0 truncate text-body text-ink-900 group-hover:text-accent",
            selected ? "font-semibold" : "font-medium",
          )}
        >
          {loop.title}
        </h3>
        <span className="shrink-0 text-micro text-ink-400 tnum">{relativeTime(loop.updatedAt)}</span>
      </div>
      <p className="mt-0.5 truncate text-micro text-ink-500 tnum">{outcomeMeta(loop)}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {loop.running ? (
          <span className="inline-flex items-center gap-1.5 text-micro font-medium text-state-active">
            <span className="live-dot size-1.5 rounded-full bg-state-active" aria-hidden="true" />
            Working
          </span>
        ) : (
          <StatusTag status={loop.status} />
        )}
      </div>
      <p className="mt-0.5 truncate text-micro text-ink-600" title={current ?? undefined}>
        {current ?? "No state recorded yet."}
      </p>
      {last && (
        <p className="mt-0.5 truncate text-micro text-ink-400" title={last.summary}>
          {last.summary}
        </p>
      )}
    </Link>
  );
}

/**
 * The example rows, used only when the workspace is genuinely empty. The first
 * one is shown as selected because it is the record open in the right pane.
 */
function ExampleRow() {
  const rows: {
    title: string;
    meta: string;
    status: LoopStatus;
    state: string;
    last: string;
    at: string;
  }[] = [
    {
      title: "Acme Electronics refund",
      meta: "$184.99 · Purchase #4821",
      status: "WAITING",
      state: "Waiting for the credit to post to the card",
      last: "Refund issued, not yet received",
      at: "2 min ago",
    },
    {
      title: "Northgate recommendation letter",
      meta: "Westbrook University · Application #A-7741",
      status: "NEEDS_HUMAN",
      state: "The registrar needs your student ID",
      last: "Counterparty requested additional information",
      at: "14 min ago",
    },
    {
      title: "Replacement shipment",
      meta: "Order #93821 · Northwind Supply",
      status: "ACTIVE",
      state: "Following up on the dispatch date",
      last: "Follow-up sent to orders@northwindsupply.com",
      at: "1 hr ago",
    },
  ];

  return (
    <>
      {rows.map((row, index) => (
        <div
          key={row.title}
          className={cn(
            "border-b border-line border-l-2 px-3 py-2.5 last:border-b-0",
            index === 0 ? "bg-sunken" : "bg-surface",
            STATUS_META[row.status].rule,
          )}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3
              className={cn(
                "min-w-0 truncate text-body text-ink-900",
                index === 0 ? "font-medium" : "font-normal",
              )}
            >
              {row.title}
            </h3>
            <span className="shrink-0 text-micro text-ink-400 tnum">{row.at}</span>
          </div>
          <p className="mt-0.5 truncate text-micro text-ink-500 tnum">{row.meta}</p>
          <div className="mt-1.5">
            <StatusTag status={row.status} />
          </div>
          <p className="mt-0.5 truncate text-micro text-ink-600">{row.state}</p>
          <p className="mt-0.5 truncate text-micro text-ink-400">{row.last}</p>
        </div>
      ))}
    </>
  );
}

/** The record pane, from real committed fields. */
function FocusRecord({ loop }: { loop: LoopListItem }) {
  const entries = [...loop.activityLog].sort((a, b) => b.at - a.at).slice(0, 4);
  const state = STATUS_META[loop.status];

  return (
    <div className={cn("border-l-2", state.rule)}>
      <div className="border-b border-line px-3.5 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 truncate text-body font-medium text-ink-900">{loop.title}</h3>
          <StatusTag status={loop.status} />
        </div>
        <p className="mt-0.5 truncate text-micro text-ink-500 tnum">{outcomeMeta(loop)}</p>
        <p className="mt-2 text-micro leading-[1.55] text-ink-800">
          {loop.currentState ?? "No state recorded yet."}
        </p>
      </div>

      <dl className="px-3.5">
        <RecordField label="Asked for" value={loop.desiredOutcome} />
        <RecordField label="Waiting for" value={loop.waitingFor ?? "Nothing — free to act"} />
        <RecordField label="Next action" value={loop.nextAction ?? "Not decided yet"} />
      </dl>

      <div className="border-t border-line px-3.5 py-2.5">
        <p className="field-label">Activity</p>
        <ol className="mt-1">
          {entries.length === 0 && <li className="text-micro text-ink-400">No events yet.</li>}
          {entries.map((entry) => (
            <ActivityLine key={entry.id} entry={entry} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function RecordField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 border-b border-line-faint py-1.5 last:border-b-0">
      <dt className="field-label whitespace-nowrap pt-0.5">{label}</dt>
      <dd className="min-w-0 text-micro leading-[1.5] text-ink-800">{value}</dd>
    </div>
  );
}

function ActivityLine({ entry }: { entry: ActivityEvent }) {
  const meta = ACTIVITY[entry.kind] ?? ACTIVITY.OBSERVATION;
  const at = new Date(entry.at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)] items-baseline gap-x-2 border-b border-line-faint py-1 last:border-b-0">
      <time className="text-micro text-ink-500 tnum">{at}</time>
      <span className="flex items-baseline gap-1.5 text-micro leading-snug text-ink-800">
        <meta.Icon className={cn("size-3 shrink-0 translate-y-px", meta.tone)} strokeWidth={1.9} aria-hidden="true" />
        <span className="min-w-0 truncate" title={entry.summary}>
          {entry.summary}
        </span>
      </span>
    </li>
  );
}

/** The example record pane, used only when there is nothing real to show. */
function ExampleFocus() {
  const lines = [
    { Icon: Search, text: "Case investigated — return was accepted", at: "17:38", tone: "text-ink-500" },
    { Icon: Send, text: "Follow-up sent to support@acmeelectronics.com", at: "17:41", tone: "text-accent" },
    { Icon: Eye, text: "Refund issued, not yet received", at: "17:42", tone: "text-ink-600" },
    { Icon: Clock, text: "Monitoring the credit posting", at: "17:42", tone: "text-state-waiting" },
  ];
  const fields: [string, string][] = [
    ["Asked for", "The $184.99 refund is confirmed received."],
    ["Waiting for", "The credit to post to the card"],
    ["Next action", "Re-read the payment record"],
  ];
  return (
    <div className="border-l-2 border-l-state-waiting">
      <div className="border-b border-line px-3.5 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 truncate text-body font-medium text-ink-900">Acme Electronics refund</h3>
          <StatusTag status="WAITING" />
        </div>
        <p className="mt-0.5 text-micro text-ink-500 tnum">$184.99 · Purchase #4821</p>
        <p className="mt-2 text-micro leading-[1.55] text-ink-800">
          Approved by Acme, but the credit has not reached the original card.
        </p>
      </div>
      <dl className="px-3.5">
        {fields.map(([label, value]) => (
          <RecordField key={label} label={label} value={value} />
        ))}
      </dl>
      <div className="border-t border-line px-3.5 py-2.5">
        <p className="field-label">Activity</p>
        <ol className="mt-1">
          {lines.map((line) => (
            <li
              key={line.at + line.text}
              className="grid grid-cols-[40px_minmax(0,1fr)] items-baseline gap-x-2 border-b border-line-faint py-1 last:border-b-0"
            >
              <time className="text-micro text-ink-500 tnum">{line.at}</time>
              <span className="flex items-baseline gap-1.5 text-micro leading-snug text-ink-800">
                <line.Icon className={cn("size-3 shrink-0 translate-y-px", line.tone)} strokeWidth={1.9} aria-hidden="true" />
                <span className="min-w-0 truncate">{line.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
