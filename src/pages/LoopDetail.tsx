import { ArrowLeft, Check, ChevronRight, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { AgentRun } from "../../shared/types";
import { ActivityLog } from "../components/ActivityLog";
import { HumanAnswer } from "../components/HumanAnswer";
import { Field, Group } from "../components/Record";
import { RunTranscript } from "../components/RunTranscript";
import { EmptyState, RecordSkeleton } from "../components/states";
import { StatusTag } from "../components/StatusTag";
import { Button } from "../components/ui/button";
import { api, type LoopBundle } from "../lib/api";
import { deadlineLabel, nextCheckLabel, openFor, outcomeMeta, relativeTime } from "../lib/format";
import { cn } from "../lib/utils";
import { useWorkspace } from "../state/workspace";

/**
 * A labelled line of the operational record.
 *
 * The workhorse of this page: a small caps label, a legible value, and a
 * hairline between rows. Sections are separated by labels and space rather than
 * by wrapping each one in its own bordered box.
 */
function RecordLine({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[88px_minmax(0,1fr)] gap-x-5 border-t border-line-faint py-3 first:border-t-0 sm:grid-cols-[104px_minmax(0,1fr)]",
        className,
      )}
    >
      <dt className="field-label pt-1">{label}</dt>
      <dd className="min-w-0 text-read leading-relaxed text-ink-800">{children}</dd>
    </div>
  );
}

/** The agent's own account of a previous pass over this outcome. */
function RunHistory({ runs }: { runs: AgentRun[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (runs.length === 0) {
    return <p className="mt-2 text-body text-ink-400">No runs recorded yet.</p>;
  }

  return (
    <ul className="mt-1.5 border-t border-line">
      {runs.slice(0, 8).map((run) => {
        const expanded = openId === run.id;
        return (
          <li key={run.id} className="border-b border-line-faint">
            <button
              type="button"
              onClick={() => setOpenId(expanded ? null : run.id)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-3 px-2 py-2 text-left transition-colors duration-75 hover:bg-surface"
            >
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 text-ink-400 transition-transform duration-150",
                  expanded && "rotate-90",
                )}
                aria-hidden="true"
              />
              <span className="text-body text-ink-700">{run.trigger.replace("_", " ")}</span>
              <span className="text-micro text-ink-400 tnum">
                {new Date(run.startedAt).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="ml-auto text-micro text-ink-400 tnum">
                {run.steps.length} step{run.steps.length === 1 ? "" : "s"}
              </span>
              <span
                className={cn(
                  "shrink-0 text-micro font-medium",
                  run.outcome === "RESOLVED"
                    ? "text-state-resolved"
                    : run.outcome === "NEEDS_HUMAN"
                      ? "text-state-human"
                      : run.outcome === "ERROR"
                        ? "text-state-risk"
                        : "text-ink-500",
                )}
              >
                {run.outcome.toLowerCase().replace("_", " ")}
              </span>
            </button>
            {expanded && (
              <RunTranscript steps={run.steps} running={false} model={run.model} className="mb-2.5" />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function LoopDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { loops, stream, runLoop, respond, removeLoop } = useWorkspace();
  const [bundle, setBundle] = useState<LoopBundle | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const liveLoop = loops.find((loop) => loop.id === id);
  const loop = liveLoop ?? bundle?.loop;

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      setBundle(await api.getLoop(id));
      setNotFound(false);
    } catch {
      setNotFound(true);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload, stream?.runId, stream?.finished]);

  const liveSteps = useMemo(
    () => (stream && stream.loopId === id ? stream.steps : []),
    [stream, id],
  );
  const running = Boolean(stream && stream.loopId === id && !stream.finished) || Boolean(liveLoop?.running);

  if (notFound) {
    return (
      <EmptyState
        label="Not found"
        title="This outcome no longer exists"
        body="It may have been deleted, or the link may point at an outcome that lives in another workspace. Everything else OpenLoop is responsible for is still on the Outcomes page."
      >
        <Link to="/app">
          <Button variant="secondary" size="sm">
            Back to outcomes
          </Button>
        </Link>
      </EmptyState>
    );
  }

  if (!loop) {
    return <RecordSkeleton />;
  }

  const meta = outcomeMeta(loop);
  const attention = loop.status === "NEEDS_HUMAN" || loop.status === "AT_RISK";

  return (
    <div>
      <Link
        to="/app"
        className="inline-flex items-center gap-1.5 text-micro text-ink-500 transition-colors duration-75 hover:text-ink-900"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Outcomes
      </Link>

      <header className="mt-3">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="text-page font-medium">{loop.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-body text-ink-500">
              {meta && <span className="tnum">{meta}</span>}
              {loop.priority !== "NORMAL" && (
                <>
                  <span className="text-ink-200">·</span>
                  <span className="text-micro font-medium uppercase text-state-risk">
                    {loop.priority}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="primary" disabled={running} onClick={() => void runLoop(loop.id)}>
              {running ? "Agent running…" : "Run agent now"}
            </Button>
            {confirmDelete ? (
              <>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await removeLoop(loop.id);
                    navigate("/app");
                  }}
                >
                  Delete
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete this outcome"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        </div>

        {/* The state of the record, exactly as the agent committed it. */}
        <div
          className={cn(
            "mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5",
            attention
              ? "border-l-2 pl-3"
              : "border-y border-line",
            loop.status === "NEEDS_HUMAN" && "border-l-state-human bg-state-human-soft",
            loop.status === "AT_RISK" && "border-l-state-risk bg-state-risk-soft",
          )}
        >
          <StatusTag status={loop.status} updatedAt={loop.updatedAt} />
          <p className="min-w-0 flex-1 text-read leading-relaxed text-ink-900">
            {loop.currentState ?? "OpenLoop has not recorded a state yet."}
          </p>
          <span className="text-micro text-ink-400 tnum">
            {loop.status === "RESOLVED"
              ? `resolved in ${openFor(loop.createdAt, loop.resolvedAt)} · ${relativeTime(loop.resolvedAt ?? loop.updatedAt)}`
              : `open ${openFor(loop.createdAt)} · updated ${relativeTime(loop.updatedAt)}`}
          </span>
        </div>

        {loop.resolutionSummary && (
          <p className="mt-3.5 max-w-[85ch] border-l border-line-strong pl-3 text-body leading-relaxed text-ink-600">
            {loop.resolutionSummary}
          </p>
        )}
      </header>

      <div className="mt-8 grid gap-x-12 gap-y-9 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="min-w-0 space-y-9">
          {loop.humanRequest && (
            <section className="rounded border border-line border-l-2 border-l-state-human bg-surface px-4 py-3.5">
              <h2 className="field-label text-state-human">Blocked on your answer</h2>
              <div className="mt-2">
                <HumanAnswer
                  loop={loop}
                  onRespond={async (value) => {
                    await respond(loop.id, value);
                    await reload();
                  }}
                />
              </div>
            </section>
          )}

          {(running || liveSteps.length > 0) && (
            <RunTranscript steps={liveSteps} running={running} model={stream?.model} />
          )}

          {/* The record itself: what was asked for, what is true, what happens next. */}
          <section>
            <h2 className="text-heading font-medium text-ink-900">The record</h2>
            <dl className="mt-2 border-t border-line">
              <RecordLine label="Asked for">{loop.desiredOutcome}</RecordLine>
              <RecordLine label="Current state">
                {loop.currentState ?? <span className="text-ink-400">Not established yet.</span>}
              </RecordLine>
              <RecordLine label="Next action">
                {loop.nextAction ?? <span className="text-ink-400">Not decided yet.</span>}
              </RecordLine>
              <RecordLine label="Waiting for">
                {loop.waitingFor ?? (
                  <span className="text-ink-400">Nothing — the agent is free to act.</span>
                )}
              </RecordLine>
              <RecordLine label="Completion">
                {loop.completionCriteria.length === 0 ? (
                  <span className="text-ink-400">The agent defines these on its first run.</span>
                ) : (
                  <ul className="space-y-1.5">
                    {loop.completionCriteria.map((criterion) => (
                      <li key={criterion} className="flex gap-2.5">
                        {loop.status === "RESOLVED" ? (
                          <Check
                            className="mt-1 size-3.5 shrink-0 text-state-resolved"
                            strokeWidth={2.4}
                            aria-hidden="true"
                          />
                        ) : (
                          <span
                            className="mt-[7px] size-1.5 shrink-0 rounded-full border border-ink-200"
                            aria-hidden="true"
                          />
                        )}
                        <span>{criterion}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </RecordLine>
            </dl>
          </section>

          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-heading font-medium text-ink-900">Activity</h2>
              <p className="text-micro text-ink-400 tnum">
                {loop.activityLog.length} event{loop.activityLog.length === 1 ? "" : "s"} · newest first
              </p>
            </div>
            <div className="mt-2 border-t border-line pt-1.5">
              <ActivityLog entries={loop.activityLog} />
            </div>
          </section>

          <section>
            <h2 className="text-heading font-medium text-ink-900">Runs</h2>
            <RunHistory runs={bundle?.runs ?? []} />
          </section>
        </div>

        {/* Metadata rail: the properties of the record, kept out of the way. */}
        <aside className="space-y-7">
          <Group title="Timing">
            <Field label="Last action">
              {loop.lastAction ?? <span className="text-ink-400">Nothing yet</span>}
            </Field>
            <Field label="Next check">
              <span className="tnum">{nextCheckLabel(loop.nextCheckAt)}</span>
            </Field>
            <Field label="Deadline">
              <span className="tnum">{deadlineLabel(loop.deadline)}</span>
            </Field>
          </Group>

          <Group title="Record">
            <Field label="Created">
              <span className="tnum">
                {new Date(loop.createdAt).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </Field>
            <Field label="Runs">
              <span className="tnum">{loop.runCount}</span>
              {loop.lastRunAt && (
                <span className="text-micro text-ink-500"> · last {relativeTime(loop.lastRunAt)}</span>
              )}
            </Field>
            <Field label="Events">
              <span className="tnum">{loop.activityLog.length}</span>
            </Field>
          </Group>

          {loop.relevantEntities.length > 0 && (
            <Group title="Involved">
              {loop.relevantEntities.map((entity) => (
                <Field key={entity.id} label={entity.kind.toLowerCase()}>
                  {entity.label}
                  {entity.detail && <span className="block text-micro text-ink-500">{entity.detail}</span>}
                </Field>
              ))}
            </Group>
          )}

          <Group title="Agent memory">
            {Object.keys(loop.context).length === 0 ? (
              <Field label="State">
                <span className="text-ink-400">Nothing recorded yet.</span>
              </Field>
            ) : (
              Object.entries(loop.context).map(([key, value]) => (
                <Field key={key} label={key} mono>
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </Field>
              ))
            )}
          </Group>
        </aside>
      </div>
    </div>
  );
}
