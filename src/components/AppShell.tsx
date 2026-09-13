import { CircleDot, History, Plus, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useWorkspace } from "../state/workspace";
import { cn } from "../lib/utils";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { DemoPanel } from "./DemoPanel";

/**
 * One destination.
 *
 * The same component serves three layouts: labelled in the mobile bar and the
 * full rail, icon-only in the 52px tablet rail, where the count becomes a dot
 * rather than a number nobody can read at that width.
 */
function NavItem({
  to,
  icon: Icon,
  label,
  count,
  tone,
  end,
  onNavigate,
}: {
  to: string;
  icon: typeof CircleDot;
  label: string;
  count?: number;
  tone?: string;
  end?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        cn(
          "group relative flex h-8 shrink-0 items-center gap-2 rounded px-2 text-body transition-colors duration-75",
          "md:h-7 md:w-8 md:justify-center md:px-0 lg:w-auto lg:justify-start lg:px-2",
          isActive
            ? "bg-surface font-medium text-ink-900"
            : "text-ink-600 hover:bg-surface/70 hover:text-ink-900",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn("size-3.5 shrink-0", isActive ? "text-accent" : "text-ink-400")}
            strokeWidth={1.9}
            aria-hidden="true"
          />
          {/* Icon-only on the narrowest phones, labelled from sm. In the rail the
              same rule holds: hidden between md and lg, shown from lg. */}
          <span className="hidden truncate sm:inline md:hidden lg:inline">{label}</span>
          {count !== undefined && count > 0 && (
            <span
              className={cn(
                "absolute right-1 top-0.5 hidden size-1.5 rounded-full md:block lg:hidden",
                tone === "text-state-active" ? "bg-state-active" : "bg-ink-300",
              )}
              aria-hidden="true"
            />
          )}
          {count !== undefined && count > 0 && (
            <span
              className={cn(
                "ml-auto hidden font-mono text-label tnum sm:inline md:hidden lg:inline",
                tone ?? "text-ink-500",
              )}
            >
              {count}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/**
 * The workspace frame.
 *
 * A fixed left rail and a working surface, the way an operations tool is laid
 * out — navigation is short because the product has one job. Below `lg` the
 * rail becomes a compact bar; the destinations do not change.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { loops, agent, simulation } = useWorkspace();
  const { pathname } = useLocation();

  const open = loops.filter((loop) => loop.status !== "RESOLVED").length;
  const needsYou = loops.filter((loop) => loop.status === "NEEDS_HUMAN").length;
  const active = loops.filter((loop) => loop.status === "ACTIVE").length;

  const nav = (onNavigate?: () => void) => (
    <>
      <NavItem to="/app" end icon={CircleDot} label="Outcomes" count={open} onNavigate={onNavigate} />
      <NavItem
        to="/app/activity"
        icon={History}
        label="Activity"
        count={active}
        tone="text-state-active"
        onNavigate={onNavigate}
      />
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* The same 2px brand rule the marketing surface opens with. */}
      <div className="fixed inset-x-0 top-0 z-40 h-0.5 bg-accent" aria-hidden="true" />

      {/* Rail — desktop */}
      {/* Rail: icon-only from md, labelled from lg, replaced by the top bar
          below md. Three deliberate layouts rather than one squeezed one. */}
      <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-sunken md:flex md:w-[52px] lg:w-[212px]">
        <div className="flex h-12 items-center justify-center border-b border-line px-3 lg:justify-start">
          <Link to="/app" aria-label="OpenLoop outcomes">
            <span className="lg:hidden">
              <Logo compact />
            </span>
            <span className="hidden lg:inline-flex">
              <Logo />
            </span>
          </Link>
        </div>

        <nav className="flex flex-col items-center gap-0.5 p-2 lg:items-stretch" aria-label="Workspace">
          {nav()}
        </nav>

        {needsYou > 0 && (
          <Link
            to="/app"
            title={`${needsYou} waiting on your answer`}
            className="mx-2 mt-0.5 hidden items-center gap-2 rounded px-2 py-1.5 text-micro text-ink-600 transition-colors duration-75 hover:bg-surface/70 hover:text-ink-900 lg:flex"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-state-human" aria-hidden="true" />
            <span className="truncate">
              <span className="font-medium text-state-human tnum">{needsYou}</span> need
              {needsYou === 1 ? "s" : ""} your answer
            </span>
          </Link>
        )}

        <div className="mt-auto border-t border-line p-2">
          <div className="flex flex-col items-center gap-0.5 lg:flex-row lg:items-center">
            <NavItem to="/app/settings" icon={Settings2} label="Settings" onNavigate={undefined} />
            <ThemeToggle className="lg:ml-auto" />
          </div>
          {/* The runtime this workspace is actually running. Reported, not decorative. */}
          <dl className="mt-2 hidden space-y-0.5 border-t border-line px-2 pt-2 text-micro text-ink-400 lg:block">
            <div className="flex items-baseline justify-between gap-2">
              <dt>Runtime</dt>
              <dd className="truncate font-mono text-ink-500">strands</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt>Model</dt>
              <dd className="truncate font-mono text-ink-500" title={agent?.modelId}>
                {agent ? agent.modelId : "—"}
                {agent?.simulated ? "*" : ""}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt>World</dt>
              <dd className="truncate font-mono text-ink-500 tnum">
                rev {simulation?.revision ?? 0}
              </dd>
            </div>
          </dl>
          {agent?.simulated && (
            <p className="mt-1.5 hidden px-2 text-micro leading-snug text-ink-400 lg:block">
              * deterministic policy model — the loop, tools and state are real Strands.
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact bar — below lg */}
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-[3px] md:hidden">
          <div className="flex h-11 items-center gap-3 px-4">
            <Link to="/app" aria-label="OpenLoop outcomes">
              <Logo />
            </Link>
            <nav className="flex items-center gap-0.5" aria-label="Workspace">
              {nav()}
            </nav>
            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle />
              <Link to="/app/new">
                <Button variant="primary" size="sm" aria-label="New outcome">
                  <Plus />
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div key={pathname} className="rise mx-auto w-full max-w-[1040px] px-5 py-7 sm:px-8 sm:py-9">
            {children}
          </div>
        </main>
      </div>

      <DemoPanel />
    </div>
  );
}
