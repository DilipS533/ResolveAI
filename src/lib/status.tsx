import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  CircleDot,
  Clock,
  CornerDownRight,
  Eye,
  Search,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ActivityKind, LoopStatus } from "../../shared/types";

/**
 * Status is communicated with a dot and a word, not a painted container.
 * The colour is semantic, the surface stays neutral.
 */
export interface StatusMeta {
  label: string;
  /** One line explaining the status from the agent's point of view. */
  meaning: string;
  /** Text colour for the label. */
  text: string;
  /** Fill colour for the indicator dot. */
  dot: string;
  /** Pale ground, used only where a status genuinely needs to pull the eye. */
  tint: string;
  border: string;
  /** Left rule for list rows — status made scannable without filling a row. */
  rule: string;
  /** Top rule, for the same indicator on a column. Written out literally so
      Tailwind can see it at build time. */
  top: string;
}

export const STATUS_META: Record<LoopStatus, StatusMeta> = {
  ACTIVE: {
    label: "Active",
    meaning: "OpenLoop is working this outcome right now.",
    text: "text-state-active",
    dot: "bg-state-active",
    tint: "bg-state-active-soft",
    border: "border-state-active/25",
    rule: "border-l-state-active",
    top: "border-t-state-active",
  },
  WAITING: {
    label: "Waiting",
    meaning: "Everything possible is done. OpenLoop is watching a named external event.",
    text: "text-state-waiting",
    dot: "bg-state-waiting",
    tint: "bg-state-waiting-soft",
    border: "border-state-waiting/25",
    rule: "border-l-state-waiting",
    top: "border-t-state-waiting",
  },
  NEEDS_HUMAN: {
    label: "Needs you",
    meaning: "OpenLoop is blocked on something only you can provide.",
    text: "text-state-human",
    dot: "bg-state-human",
    tint: "bg-state-human-soft",
    border: "border-state-human/25",
    rule: "border-l-state-human",
    top: "border-t-state-human",
  },
  AT_RISK: {
    label: "At risk",
    meaning: "Nothing has moved and the date the other side gave has passed.",
    text: "text-state-risk",
    dot: "bg-state-risk",
    tint: "bg-state-risk-soft",
    border: "border-state-risk/25",
    rule: "border-l-state-risk",
    top: "border-t-state-risk",
  },
  RESOLVED: {
    label: "Resolved",
    meaning: "The outcome was observed as done, not promised.",
    text: "text-state-resolved",
    dot: "bg-state-resolved",
    tint: "bg-state-resolved-soft",
    border: "border-state-resolved/25",
    rule: "border-l-state-resolved",
    top: "border-t-state-resolved",
  },
};

/**
 * The event taxonomy of the activity log.
 *
 * Each kind maps to a glyph that describes what actually happened, so the log
 * reads like operational history: a search, an outbound action, an observation,
 * a conclusion drawn from one, a state transition, a pause, an escalation.
 */
export const ACTIVITY: Record<ActivityKind, { label: string; Icon: LucideIcon; tone: string }> = {
  CREATED: { label: "Ownership taken", Icon: CircleDot, tone: "text-ink-500" },
  INVESTIGATE: { label: "Looked again", Icon: Search, tone: "text-ink-500" },
  ACTION: { label: "Action taken", Icon: ArrowUpRight, tone: "text-accent" },
  OBSERVATION: { label: "Observed", Icon: Eye, tone: "text-ink-600" },
  INTERPRETATION: { label: "Concluded", Icon: CornerDownRight, tone: "text-ink-700" },
  STATE: { label: "Status changed", Icon: ArrowLeftRight, tone: "text-ink-500" },
  WAITING: { label: "Monitoring", Icon: Clock, tone: "text-state-waiting" },
  ESCALATION: { label: "Needs you", Icon: UserRound, tone: "text-state-human" },
  RESOLVED: { label: "Verified", Icon: Check, tone: "text-state-resolved" },
  ERROR: { label: "Failed", Icon: AlertTriangle, tone: "text-state-risk" },
};

/** The lifecycle the product promises, in order. Used on the landing page. */
export const LIFECYCLE = [
  { key: "understand", label: "Take the outcome", detail: "Own responsibility for the result" },
  { key: "investigate", label: "Investigate", detail: "Read mail and the external record" },
  { key: "act", label: "Act", detail: "Chase, supply, or correct as needed" },
  { key: "wait", label: "Wait", detail: "Stop acting when acting achieves nothing" },
  { key: "monitor", label: "Monitor", detail: "Watch for the next external change" },
  { key: "interpret", label: "Interpret", detail: "Decide what the change means" },
  { key: "verify", label: "Verify", detail: "Confirm the outcome itself, not a promise" },
  { key: "resolve", label: "Close", detail: "Record completion with evidence" },
] as const;
