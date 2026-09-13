import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import type { LoopStatus } from "../../shared/types";
import type { LoopListItem } from "../lib/api";
import { LoopRow } from "../components/LoopRow";
import { RunTranscript } from "../components/RunTranscript";
import { EmptyState, ErrorState, OutcomeListSkeleton } from "../components/states";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/field";
import { cn } from "../lib/utils";
import { relativeTime } from "../lib/format";
import { useWorkspace } from "../state/workspace";

/** The two seeded outcomes, backed by different external systems. */
const DEMO_OUTCOMES = [
  "Make sure my $184.99 refund from Acme Electronics gets resolved.",
  "Make sure my school recommendation request gets completed.",
];

/** Tabs are real statuses, in the order they matter operationally. */
const TABS: { key: "ALL" | LoopStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "WAITING", label: "Waiting" },
  { key: "NEEDS_HUMAN", label: "Needs you" },
  { key: "AT_RISK", label: "At risk" },
  { key: "RESOLVED", label: "Resolved" },
];

/**
 * Outcomes blocked on the owner.
 *
 * The agent committed a specific question to the loop; answering it here records
 * the answer and the agent continues on its own. This is the only block in the
 * dashboard that raises its voice, because it is the only one that needs a person.
 */
function WaitingOnYou({ blocked }: { blocked: LoopListItem[] }) {
  const { respond } = useWorkspace();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <section className="mt-6 rounded border border-line border-l-2 border-l-state-human bg-surface">
      <header className="border-b border-line px-3.5 py-2">
        <h2 className="text-micro font-medium text-state-human">
          {blocked.length} outcome{blocked.length === 1 ? "" : "s"} blocked on your answer
        </h2>
      </header>

      {blocked.map((loop) => (
        <div key={loop.id} className="border-b border-line-faint px-3.5 py-3 last:border-b-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Link to={`/app/loops/${loop.id}`} className="text-title font-medium text-ink-900 hover:text-accent">
              {loop.title}
            </Link>
            <span className="text-micro text-ink-400">{loop.humanRequest?.reason}</span>
          </div>
          <p className="mt-1.5 max-w-[75ch] text-body leading-relaxed text-ink-800">
            {loop.humanRequest?.question}
          </p>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <Textarea
              rows={2}
              value={drafts[loop.id] ?? ""}
              onChange={(event) => setDrafts((current) => ({ ...current, [loop.id]: event.target.value }))}
              placeholder="Your answer — OpenLoop uses it and carries on."
              className="sm:flex-1"
              aria-label={`Answer for ${loop.title}`}
            />
            <Button
              variant="primary"
              className="sm:self-end"
              disabled={busy === loop.id || !(drafts[loop.id] ?? "").trim()}
              onClick={async () => {
                setBusy(loop.id);
                try {
                  await respond(loop.id, (drafts[loop.id] ?? "").trim());
                  setDrafts((current) => ({ ...current, [loop.id]: "" }));
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === loop.id ? "Sending…" : "Send answer"}
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

export function Dashboard() {
  const { loops, stream, loading, error, refresh, createLoop } = useWorkspace();
  const navigate = useNavigate();
  const [seeding, setSeeding] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [tab, setTab] = useState<"ALL" | LoopStatus>("ALL");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    map.set("ALL", loops.length);
    for (const loop of loops) map.set(loop.status, (map.get(loop.status) ?? 0) + 1);
    return map;
  }, [loops]);

  const visible = useMemo(
    () => (tab === "ALL" ? loops : loops.filter((loop) => loop.status === tab)),
    [loops, tab],
  );

  const blocked = loops.filter((loop) => loop.status === "NEEDS_HUMAN" && loop.humanRequest);
  const open = counts.get("ALL")! - (counts.get("RESOLVED") ?? 0);
  const lastActivity = loops
    .map((loop) => loop.activityLog[loop.activityLog.length - 1]?.at ?? 0)
    .sort((a, b) => b - a)[0];
  const streamLoop = stream ? loops.find((loop) => loop.id === stream.loopId) : undefined;

  const seedDemo = async () => {
    setSeeding(true);
    try {
      let first: string | null = null;
      for (const outcome of DEMO_OUTCOMES) {
        const id = await createLoop({ outcome });
        first ??= id;
      }
      if (first) navigate(`/app/loops/${first}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-page font-medium">Outcomes</h1>
          <p className="mt-1 text-body text-ink-500 tnum">
            {loops.length} total · {open} open
            {lastActivity ? ` · last activity ${relativeTime(lastActivity)}` : ""}
          </p>
        </div>
        <Link to="/app/new" className="shrink-0">
          <Button variant="primary">New outcome</Button>
        </Link>
      </header>

      {error && (
        <ErrorState
          className="mt-6"
          message={error}
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            void refresh().finally(() => setRetrying(false));
          }}
        />
      )}

      {stream && streamLoop && (
        <section className="mt-6">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="live-dot size-1.5 rounded-full bg-state-active" aria-hidden="true" />
            <p className="text-body text-ink-800">
              Working <span className="font-medium">{streamLoop.title}</span>
            </p>
            {stream.steps.length > 0 && (
              <p className="min-w-0 flex-1 truncate text-micro text-ink-500">
                {stream.steps[stream.steps.length - 1].text}
              </p>
            )}
            <Link to={`/app/loops/${stream.loopId}`} className="text-micro text-accent hover:underline">
              Open
            </Link>
          </div>
          <RunTranscript
            steps={stream.steps}
            running={!stream.finished}
            model={stream.model}
            className="mt-2.5"
          />
        </section>
      )}

      {blocked.length > 0 && <WaitingOnYou blocked={blocked} />}

      {/* Filter tabs, with the counts they actually have. */}
      <nav
        className="mt-7 flex items-stretch gap-4 overflow-x-auto border-b border-line"
        aria-label="Filter outcomes by status"
      >
        {TABS.map(({ key, label }) => {
          const count = counts.get(key) ?? 0;
          const selected = tab === key;
          return (
            <button
              key={key}
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-0.5 pb-2 text-body transition-colors duration-75",
                selected
                  ? "border-ink-900 font-medium text-ink-900"
                  : "border-transparent text-ink-500 hover:border-line-strong hover:text-ink-800",
                count === 0 && !selected && "text-ink-300 hover:text-ink-500",
              )}
            >
              {label}
              <span className="font-mono text-micro text-ink-500 tnum">{count}</span>
            </button>
          );
        })}
      </nav>

      {loading ? (
        <OutcomeListSkeleton />
      ) : loops.length === 0 ? (
        <EmptyState
          className="mt-6"
          label="No outcomes yet"
          title="Nothing is outstanding yet."
          body="Hand OpenLoop an outcome in one sentence — a refund, a reply, a document, a decision — and it will investigate, act, wait, monitor and verify until it is genuinely done. Nothing is forgotten while it waits."
        >
          <Button variant="primary" disabled={seeding} onClick={() => void seedDemo()}>
            {seeding ? "Starting…" : "Start the two demo outcomes"}
          </Button>
          <Link to="/app/new" className="text-micro text-accent hover:underline">
            or describe your own
          </Link>
        </EmptyState>
      ) : visible.length === 0 ? (
        <p className="mt-6 border-t border-line pt-5 text-body text-ink-500">
          No outcomes are in this state right now.{" "}
          <button
            type="button"
            onClick={() => setTab("ALL")}
            className="text-accent transition-colors duration-75 hover:underline"
          >
            Show all {loops.length}
          </button>
        </p>
      ) : (
        <div className="mt-1">
          {visible.map((loop) => (
            <LoopRow key={loop.id} loop={loop} />
          ))}
        </div>
      )}
    </div>
  );
}
