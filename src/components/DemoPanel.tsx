import { ChevronDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CaseSummary, DemoActionKind } from "../../shared/types";
import { useWorkspace } from "../state/workspace";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

/**
 * The verbs the demo panel can perform on the outside world.
 *
 * They are generic on purpose: they advance whichever external record is
 * selected along its own milestone chain. The agent is never told which verb
 * was used, or what it means — it has to go and read the record.
 */
const VERBS: { action: DemoActionKind; label: string; hint: string }[] = [
  {
    action: "COUNTERPARTY_RESPONDS",
    label: "Counterparty replies",
    hint: "Mail arrives. The record does not move.",
  },
  {
    action: "COUNTERPARTY_NEEDS_INFO",
    label: "Counterparty needs information",
    hint: "Blocks the record on something only you have.",
  },
  {
    action: "ADVANCE_ONE_STEP",
    label: "Advance one milestone",
    hint: "Moves the record one step along its own chain.",
  },
  { action: "COMPLETE_OUTCOME", label: "Run to the final milestone", hint: "Takes the record to the outcome." },
];

function Milestones({ simCase }: { simCase: CaseSummary }) {
  const current = simCase.milestones.indexOf(simCase.status);
  return (
    <p className="mt-1 font-mono text-label leading-relaxed">
      {simCase.milestones.map((milestone, index) => (
        <span key={milestone}>
          {index > 0 && <span className="text-ink-300"> → </span>}
          <span
            className={cn(
              index < current ? "text-ink-400" : index === current ? "text-accent" : "text-ink-300",
            )}
          >
            {milestone.replace(/_/g, " ")}
          </span>
        </span>
      ))}
    </p>
  );
}

/**
 * Simulated-world controls.
 *
 * This is a developer instrument, not product surface: it changes only the
 * external systems and never an open loop. Everything the agent concludes from
 * those changes it has to discover through its tools on the next run.
 */
export function DemoPanel() {
  const { simulation, demoAction } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);

  const cases = simulation?.cases ?? [];
  const active = useMemo(() => {
    if (selected) return cases.find((item) => item.id === selected) ?? null;
    return cases.find((item) => !item.isComplete) ?? cases[0] ?? null;
  }, [cases, selected]);

  const available = useMemo(() => {
    const entry = simulation?.actions.find((item) => item.caseId === active?.id);
    return new Map((entry?.actions ?? []).map((item) => [item.action, item.available]));
  }, [simulation, active]);

  const apply = async (action: DemoActionKind) => {
    setBusy(action);
    try {
      setLast(await demoAction(action, active?.id));
    } catch (error) {
      setLast(error instanceof Error ? error.message : "Demo action failed");
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 rounded-full border border-dashed border-line-strong bg-surface px-3 py-1.5 text-micro font-medium text-ink-500 transition-colors duration-150 hover:border-ink-300 hover:text-ink-900"
      >
        Demo controls
      </button>
    );
  }

  return (
    <aside className="rise fixed right-4 bottom-4 z-40 max-h-[calc(100vh-2rem)] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-line-strong bg-surface float-shadow">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-micro font-medium text-ink-800">Simulated world</p>
          <p className="font-mono text-label text-ink-500">
            revision {simulation?.revision ?? 0} · {simulation?.pendingLoops.length ?? 0} awaiting recheck
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Collapse demo controls">
          <ChevronDown />
        </Button>
      </header>

      <div className="space-y-3 p-3">
        <div className="space-y-1">
          {cases.map((simCase) => {
            const isActive = simCase.id === active?.id;
            return (
              <button
                key={simCase.id}
                type="button"
                onClick={() => setSelected(simCase.id)}
                className={cn(
                  "w-full rounded border px-2.5 py-2 text-left transition-colors duration-100",
                  isActive
                    ? "border-accent-line bg-accent-soft"
                    : "border-line hover:border-line-strong hover:bg-raised",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-body font-medium text-ink-900">{simCase.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-label text-ink-500">
                    {simCase.reference}
                  </span>
                </span>
                <Milestones simCase={simCase} />
              </button>
            );
          })}
        </div>

        {active && (
          <div className="space-y-1 border-t border-line pt-3">
            <p className="field-label pb-1">Change the outside world</p>
            {VERBS.map((verb) => {
              const enabled = available.get(verb.action) ?? true;
              const next =
                verb.action === "ADVANCE_ONE_STEP"
                  ? active.milestones[active.milestones.indexOf(active.status) + 1]
                  : undefined;
              return (
                <button
                  key={verb.action}
                  type="button"
                  disabled={busy !== null || !enabled}
                  onClick={() => void apply(verb.action)}
                  className="w-full rounded border border-line px-2.5 py-1.5 text-left transition-colors duration-100 hover:border-line-strong hover:bg-raised disabled:opacity-40"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-body text-ink-800">{verb.label}</span>
                    {next && (
                      <span className="ml-auto shrink-0 font-mono text-label text-accent">
                        {next.replace(/_/g, " ")}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-micro leading-snug text-ink-400">
                    {busy === verb.action ? "applying…" : verb.hint}
                  </span>
                </button>
              );
            })}
            <Button
              variant="quiet"
              size="sm"
              className="mt-1 w-full"
              disabled={busy !== null}
              onClick={() => void apply("RESET_SCENARIO")}
            >
              Reset the world
            </Button>
          </div>
        )}

        {last && (
          <div className="flex items-start gap-2 rounded border border-line bg-sunken px-2.5 py-2">
            <p className="text-micro leading-snug text-ink-600">{last}</p>
            <button
              type="button"
              onClick={() => setLast(null)}
              className="ml-auto text-ink-400 hover:text-ink-700"
              aria-label="Dismiss"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        <p className="border-t border-line pt-2 text-micro leading-relaxed text-ink-400">
          Nothing here tells the agent anything. Changing the world only wakes the loops watching it —
          the agent finds out by reading the record. Last change:{" "}
          {simulation?.lastChangeLabel ?? "—"}.
        </p>
      </div>
    </aside>
  );
}
