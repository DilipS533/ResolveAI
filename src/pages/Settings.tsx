import { useState } from "react";
import { LoopRow } from "../components/LoopRow";
import { useWorkspace } from "../state/workspace";
import { ActivityLog } from "../components/ActivityLog";
import { LoopGlyph } from "../components/Logo";
import { ErrorState, OutcomeListSkeleton } from "../components/states";

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-x-4 border-t border-line-faint py-2.5 first:border-t-0">
      <dt className="field-label pt-0.5">{label}</dt>
      <dd className={mono ? "font-mono text-micro text-ink-800" : "text-body text-ink-800"}>{value}</dd>
    </div>
  );
}

/**
 * Settings, reported rather than configured.
 *
 * Everything here is read from the running backend: which model is deciding,
 * which tools are registered, and what the simulated world currently contains.
 * There are no switches that would change nothing.
 */
export function Settings() {
  const { agent, simulation, loops, loading, error, refresh } = useWorkspace();
  const [retrying, setRetrying] = useState(false);
  const latest = loops
    .flatMap((loop) => loop.activityLog)
    .sort((a, b) => b.at - a.at)
    .slice(0, 5);

  return (
    <div>
      <h1 className="text-page font-medium">Settings</h1>
      <p className="mt-1.5 max-w-[68ch] text-body text-ink-500">
        What this workspace is actually running. The agent runtime decides everything below on its
        own; none of it is configurable from here, so none of it is presented as a control.
      </p>

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

      {loading && !agent ? (
        <OutcomeListSkeleton rows={3} />
      ) : (
      <div className="mt-8 grid gap-x-14 gap-y-9 lg:grid-cols-2">
        <section>
          <h2 className="field-label">Agent runtime</h2>
          <dl className="mt-1.5 border-t border-line">
            <Row label="Framework" value="AWS Strands Agents" />
            <Row label="Provider" value={agent?.provider ?? "unknown"} mono />
            <Row label="Model" value={agent?.modelId ?? "unknown"} mono />
            <Row
              label="Decider"
              value={
                agent?.simulated
                  ? "Deterministic policy model — the agent loop, tools, and state are real; this replaces only the model call."
                  : "Hosted model"
              }
            />
          </dl>
        </section>

        <section>
          <h2 className="field-label">External world</h2>
          <dl className="mt-1.5 border-t border-line">
            <Row label="Implementation" value="Simulated providers" />
            <Row label="Records" value={<span className="tnum">{simulation?.cases.length ?? 0}</span>} />
            <Row
              label="Revision"
              value={<span className="tnum">{simulation?.revision ?? 0}</span>}
            />
            <Row
              label="Awaiting recheck"
              value={<span className="tnum">{simulation?.pendingLoops.length ?? 0}</span>}
            />
            <Row label="Last change" value={simulation?.lastChangeLabel ?? "—"} />
          </dl>
          <p className="mt-3 text-micro leading-relaxed text-ink-400">
            The demo controls change only these external records. The agent learns about a change by
            reading them on its next pass — it is never told what happened.
          </p>
        </section>

        <section className="lg:col-span-2">
          <h2 className="field-label">Registered tools</h2>
          <ul className="mt-1.5 border-t border-line">
            {(agent?.tools ?? []).map((tool) => (
              <li
                key={tool.name}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-line-faint py-2"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-micro text-ink-800">{tool.name}</span>
                  <span className="mt-0.5 block text-micro text-ink-400">{tool.description}</span>
                </span>
                <span className="text-micro font-medium text-ink-500">
                  {tool.group}
                </span>
              </li>
            ))}
            {(agent?.tools ?? []).length === 0 && (
              <li className="py-3 text-body text-ink-400">No tools reported yet.</li>
            )}
          </ul>
        </section>

        <section className="lg:col-span-2">
          <h2 className="field-label">Latest workspace activity</h2>
          <div className="sheet mt-1.5 px-4 py-2">
            <ActivityLog entries={latest} emptyLabel="Nothing has happened yet." groupByDay={false} />
          </div>
        </section>

        <section className="lg:col-span-2">
          <h2 className="field-label">Outcomes in this workspace</h2>
          <div className="mt-1.5">
            {loops.length === 0 ? (
              <p className="border-t border-line py-4 text-body text-ink-400">
                No outcomes have been handed over yet.
              </p>
            ) : (
              loops.map((loop) => <LoopRow key={loop.id} loop={loop} />)
            )}
          </div>
        </section>
      </div>

      )}

      <p className="mt-10 flex items-start gap-2.5 border-t border-line pt-5 text-micro leading-relaxed text-ink-400">
        <LoopGlyph className="mt-px size-3.5 shrink-0 text-ink-300" />
        Outcomes, activity, and the agent&apos;s memory live in the backend store. Reloading this page
        reads that state back; nothing is reconstructed in the browser.
      </p>
    </div>
  );
}
