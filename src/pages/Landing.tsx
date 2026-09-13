import { ArrowRight, Check, CircleDot, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { WorkspaceWindow } from "../components/WorkspaceWindow";
import { Button } from "../components/ui/button";
import { LIFECYCLE } from "../lib/status";
import { cn } from "../lib/utils";

/**
 * The three gates the agent refuses to break. Each one is enforced in the
 * runtime and asserted in the API test suite, with the seeded outcome that
 * exercises it.
 */
const GATES = [
  {
    gate: "approved ≠ paid",
    statement: "A refund approval is evidence of intent, not of money.",
    detail:
      "Acme approved the refund. The loop stayed open and the agent kept monitoring until the credit appeared on the payment record.",
  },
  {
    gate: "submitted ≠ received",
    statement: "A submission is evidence of effort, not of arrival.",
    detail:
      "The letter was submitted to the university portal. The loop stayed open until the registrar confirmed receipt.",
  },
  {
    gate: "promised ≠ observed",
    statement: "A reply is context. It is never completion.",
    detail:
      "A counterparty answering changes what the agent knows, not where the loop stands. Only the observed outcome closes it.",
  },
];

/** The persisted loop fields, exactly as the store holds them. */
const PERSISTED = [
  ["status", "WAITING"],
  ["waitingFor", "the credit to post to the card"],
  ["nextAction", "re-read the payment record"],
  ["nextCheckAt", "in 4 hours"],
  ["runCount", "3"],
];

function Band({
  id,
  tone = "white",
  children,
}: {
  id?: string;
  tone?: "white" | "gray";
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("border-t border-line", tone === "gray" ? "bg-sunken" : "bg-canvas")}>
      <div className="mx-auto w-full max-w-[1060px] px-5 py-16 sm:px-8 sm:py-24">{children}</div>
    </section>
  );
}

function BandHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <header className="mx-auto max-w-[720px] text-center">
      <p className="text-body font-medium text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-heading font-semibold text-ink-900 sm:text-[32px] sm:leading-[1.15]">
        {title}
      </h2>
      {lead && <p className="mt-4 text-read leading-[1.5] text-ink-500">{lead}</p>}
    </header>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-12 w-full max-w-[1060px] items-center gap-8 px-5 sm:px-8">
          <Logo />
          <nav className="hidden items-center gap-7 text-body text-ink-700 sm:flex" aria-label="Product">
            <a href="#how" className="transition-colors duration-150 hover:text-ink-900">
              How it works
            </a>
            <a href="#verify" className="transition-colors duration-150 hover:text-ink-900">
              Verification
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <Link to="/app">
              <Button variant="primary" size="sm">
                Open workspace
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero: centred type, then the product itself as the image. */}
      <section className="bg-canvas">
        <div className="mx-auto w-full max-w-[1060px] px-5 pb-10 pt-16 text-center sm:px-8 sm:pb-14 sm:pt-24">
          <div className="rise mx-auto max-w-[880px]">
            <h1 className="text-[38px] font-semibold leading-[1.06] tracking-[-0.03em] text-ink-900 sm:text-[56px]">
              Give it an outcome.
              <span className="block text-ink-500">It stays on it until it&apos;s done.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[640px] text-[17px] leading-[1.45] text-ink-500 sm:text-[19px]">
              People start things that require waiting — a refund, a reply, an approval, a document —
              and lose track of them. OpenLoop takes responsibility for the result until it is
              actually observed as done.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <Link to="/app/new">
                <Button variant="primary" size="lg">
                  Hand over an outcome
                  <ArrowRight />
                </Button>
              </Link>
              <Link
                to="/app"
                className="text-read text-accent transition-colors duration-150 hover:underline"
              >
                See what it is working on →
              </Link>
            </div>
          </div>

          <div
            className="rise mx-auto mt-14 max-w-[980px] text-left"
            style={{ animationDelay: "80ms" }}
          >
            <div className="elevate rounded-xl">
              <WorkspaceWindow />
            </div>
          </div>
        </div>
      </section>

      <Band id="how" tone="gray">
        <BandHead
          eyebrow="How it works"
          title="You describe the result. OpenLoop owns the loop that gets you there."
          lead="One sentence becomes a durable obligation with completion criteria, a named next action, and a memory that survives every pass the agent makes."
        />
        <ol className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {LIFECYCLE.map((phase, index) => (
            <li key={phase.key}>
              <span className="block text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink-200 tnum">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-title font-semibold">{phase.label}</h3>
              <p className="mt-1 text-body leading-[1.5] text-ink-500">{phase.detail}</p>
            </li>
          ))}
        </ol>

        <div className="mt-14 grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center">
          <div>
            <h3 className="text-[22px] font-semibold leading-[1.25] text-ink-900">
              Waiting is the part most automation gets wrong.
            </h3>
            <p className="mt-3 max-w-[62ch] text-read leading-[1.5] text-ink-500">
              OpenLoop stops acting when acting achieves nothing — and keeps the loop open, named and
              scheduled until the world changes. Nothing is remembered by hope; it is remembered by
              state.
            </p>
          </div>
          <div className="sheet overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line bg-sunken px-4 py-2.5">
              <Clock className="size-4 text-state-waiting" strokeWidth={2} aria-hidden="true" />
              <p className="text-micro font-medium text-ink-700">Persisted while waiting</p>
            </div>
            <dl className="px-4 py-2 font-mono text-micro">
              {PERSISTED.map(([key, value]) => (
                <div key={key} className="flex gap-4 border-b border-line-faint py-2 last:border-b-0">
                  <dt className="w-[104px] shrink-0 text-ink-500">{key}</dt>
                  <dd className="min-w-0 text-ink-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Band>

      <Band id="verify">
        <BandHead
          eyebrow="Verification"
          title="A promise is not an outcome."
          lead="The hardest part of owning an outcome is refusing to call it done early. Every external signal is treated as evidence about a state, never as the state itself."
        />
        <ul className="mt-12 grid gap-x-10 gap-y-9 lg:grid-cols-3">
          {GATES.map((item) => (
            <li key={item.gate}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 font-mono text-micro text-ink-700">
                <Check className="size-3.5 shrink-0 text-state-resolved" strokeWidth={2.6} aria-hidden="true" />
                {item.gate}
              </span>
              <h3 className="mt-3.5 text-title font-semibold">{item.statement}</h3>
              <p className="mt-1.5 text-body leading-[1.5] text-ink-500">{item.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-12 flex items-center justify-center gap-2 text-micro text-ink-500">
          <CircleDot className="size-3.5 shrink-0 text-ink-300" strokeWidth={2} aria-hidden="true" />
          These three rules are asserted against the running API in this repository, alongside the
          lifecycle, persistence and resumption paths.
        </p>
      </Band>

      <Band tone="gray">
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="text-heading font-semibold text-ink-900 sm:text-[32px] sm:leading-[1.15]">
            Stop tracking outcomes. Hand them over.
          </h2>
          <p className="mt-4 text-read leading-[1.5] text-ink-500">
            One sentence in. OpenLoop stays on it until it is actually done, and tells you exactly what
            it is waiting for in the meantime.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <Link to="/app/new">
              <Button variant="primary" size="lg">
                Give OpenLoop an outcome
                <ArrowRight />
              </Button>
            </Link>
            <Link
              to="/app"
              className="text-read text-accent transition-colors duration-150 hover:underline"
            >
              Open the workspace →
            </Link>
          </div>
        </div>
      </Band>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-2 px-5 py-8 text-micro text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <p>
            Agent runtime · registered tools · provider boundaries · persisted state · external systems
            simulated.
          </p>
        </div>
      </footer>
    </div>
  );
}
