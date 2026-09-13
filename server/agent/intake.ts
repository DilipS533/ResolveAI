import { Agent } from "@strands-agents/sdk";
import { z } from "zod";
import type { LoopContext, LoopPriority, RelevantEntity, CaseRecord } from "../../shared/types";
import type { ExternalProviders } from "../providers/types";
import type { ResolvedModel } from "./model";

export interface IntakeResult {
  title: string;
  desiredOutcome: string;
  description: string;
  priority: LoopPriority;
  deadline: number | null;
  completionCriteria: string[];
  relevantEntities: RelevantEntity[];
  context: LoopContext;
}

type Archetype = "refund" | "response" | "document" | "application" | "appointment" | "teammate" | "generic";

interface ArchetypeRule {
  archetype: Archetype;
  test: RegExp;
  /** Completion criteria a person would accept as "this is actually done". */
  criteria: string[];
}

const ARCHETYPES: ArchetypeRule[] = [
  {
    archetype: "refund",
    test: /refund|reimburs|money back|chargeback|return|credit note/i,
    criteria: [
      "The counterparty confirms the refund or credit is approved",
      "The money is released to the original payment method",
      "The credit is observed as received — not merely promised",
    ],
  },
  {
    archetype: "response",
    test: /respond|reply|get back to me|hear back|answer|follow up with|chase/i,
    criteria: [
      "The other party replies with a substantive answer",
      "The question that opened this loop is answered",
    ],
  },
  {
    archetype: "document",
    test: /document|contract|paperwork|form|certificate|invoice|statement|receipt|deed|policy|letter|recommendation/i,
    criteria: [
      "The document is produced",
      "The receiving organisation confirms it has been received — not just submitted",
    ],
  },
  {
    archetype: "application",
    test: /application|apply|approv|decision|permit|visa|licen[cs]e|claim|enrol|admission/i,
    criteria: [
      "The decision is issued",
      "The outcome is confirmed in writing — not just indicated verbally",
    ],
  },
  {
    archetype: "appointment",
    test: /appointment|booking|schedule|reschedul|slot|consultation/i,
    criteria: [
      "The appointment is confirmed for a specific time",
      "The confirmation is received in writing",
    ],
  },
  {
    archetype: "teammate",
    test: /teammate|colleague|coworker|co-worker|reviewer|sign off|sign-off|hand ?off|approve my/i,
    criteria: ["The other person completes what they owe", "The result is confirmed as complete"],
  },
];

const GENERIC_CRITERIA = [
  "The outcome the owner asked for is observed as true, not promised",
  "Nothing further is outstanding to reach it",
];

function detectArchetype(outcome: string): ArchetypeRule {
  return (
    ARCHETYPES.find((rule) => rule.test.test(outcome)) ?? {
      archetype: "generic",
      test: /./,
      criteria: GENERIC_CRITERIA,
    }
  );
}

function detectAmount(outcome: string): number | undefined {
  const match = outcome.match(/\$\s?([0-9][0-9,]*)(?:\.([0-9]{1,2}))?/);
  if (!match) return undefined;
  const value = Number(`${match[1].replace(/,/g, "")}.${match[2] ?? "0"}`);
  return Number.isFinite(value) ? value : undefined;
}

function detectCounterparty(outcome: string): string | undefined {
  const match = outcome.match(
    /\b(?:from|at|with|by|to)\s+([A-Z][A-Za-z0-9&'’.-]*(?:\s+[A-Z][A-Za-z0-9&'’.-]*){0,3})/,
  );
  return match?.[1]?.trim();
}

function detectReference(outcome: string): string | undefined {
  const match = outcome.match(/\b([A-Z]{2,6}-[0-9]{3,8})\b/);
  return match?.[1];
}

function readable(status: string): string {
  return status.replace(/_/g, " ").toLowerCase();
}

/* ------------------------------------------------------------------ *
 * Hosted-LLM refinement (optional, never the source of classification)
 * ------------------------------------------------------------------ */

const IntakeSchema = z.object({
  title: z.string().describe("Four words or fewer naming the outcome, e.g. 'Acme Electronics refund'."),
  description: z.string().describe("One or two sentences describing the situation behind the outcome."),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  completionCriteria: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe("What must observably be true for this outcome to count as achieved."),
});

const INTAKE_SYSTEM = `You convert a person's stated outcome into a structured open-loop record.

Rules:
- The title names the thing being resolved, not the action. "Acme Electronics refund", not "Chase refund".
- The description states the situation implied by the request in one or two sentences.
- Completion criteria must describe observable end states, and must distinguish a promise from the actual outcome. Never accept "they said they will" as completion.
- Do not invent facts the person did not imply.`;

/* ------------------------------------------------------------------ *
 * Intake
 * ------------------------------------------------------------------ */

function contextFromCase(simCase: CaseRecord): LoopContext {
  const facts = simCase.facts;
  return {
    caseId: simCase.id,
    caseKind: simCase.kind,
    counterparty: simCase.counterparty.address,
    counterpartyName: simCase.counterparty.name,
    reference: simCase.reference,
    status: simCase.status,
    completeStatus: simCase.completeStatus,
    dueBy: simCase.dueBy,
    subject: simCase.subject,
    ...Object.fromEntries(
      Object.entries(facts).filter(([, value]) => value !== null && value !== undefined),
    ),
  };
}

function entitiesFromCase(simCase: CaseRecord): RelevantEntity[] {
  const entities: RelevantEntity[] = [
    {
      id: "entity_counterparty",
      kind: simCase.kind === "REFUND" ? "COMPANY" : "PERSON",
      label: simCase.counterparty.name,
      detail: simCase.counterparty.address,
    },
    {
      id: "entity_reference",
      kind: simCase.kind === "REFUND" ? "ORDER" : "DOCUMENT",
      label: simCase.reference,
      detail: simCase.subject,
    },
    {
      id: "entity_target",
      kind: "SYSTEM",
      label: `Target state: ${readable(simCase.completeStatus)}`,
      detail: "What has to be true for OpenLoop to close this loop",
    },
  ];
  const university = simCase.facts.university;
  if (typeof university === "string") {
    entities.push({
      id: "entity_third_party",
      kind: "COMPANY",
      label: university,
      detail: typeof simCase.facts.portal === "string" ? simCase.facts.portal : undefined,
    });
  }
  return entities;
}

function criteriaFromCase(simCase: CaseRecord): string[] {
  return [
    `${simCase.counterparty.name} acknowledges the request and states what happens next`,
    `The record moves to ${readable(simCase.completeStatus)}`,
    `That final state is observed in the external record — not merely reported by ${simCase.counterparty.name}`,
  ];
}

/**
 * Turn free text into a structured loop.
 *
 * Two passes, deliberately ordered:
 *
 *  1. Resolve the outcome against the external systems. If a record exists,
 *     the loop is grounded in that record's real state — its reference, its
 *     current milestone, its target milestone, and its deadline. This is the
 *     only reason the agent can act on the very first run.
 *  2. Fall back to classifying the sentence on its own when no record exists.
 *     The agent then discovers that via tools and escalates honestly.
 *
 * When a hosted LLM is configured it only refines the wording. It never
 * decides which external system the outcome is about.
 */
export async function intakeOutcome(
  rawOutcome: string,
  external: ExternalProviders,
  resolved: ResolvedModel,
): Promise<IntakeResult> {
  const outcome = rawOutcome.trim();
  const rule = detectArchetype(outcome);
  const amount = detectAmount(outcome);
  const namedCounterparty = detectCounterparty(outcome);
  const explicitReference = detectReference(outcome);

  // Ask the connected external systems whether any of them recognises this
  // outcome. This is the only place intake learns which system a sentence is
  // about, and it learns it the same way the agent does: by asking.
  const matched = await external.resolveCase(outcome);

  if (matched) {
    const priority: LoopPriority =
      new Date(matched.dueBy).getTime() < Date.now() ? "HIGH" : "NORMAL";
    const description = [
      `${matched.counterparty.name} is responsible for ${matched.subject}${
        matched.reference ? ` (${matched.reference})` : ""
      }.`,
      matched.statusMeaning[matched.status] ?? matched.note,
      `The outcome is only achieved once the record reaches ${readable(matched.completeStatus)}.`,
    ].join(" ");

    const base: IntakeResult = {
      title: matched.title,
      desiredOutcome: outcome,
      description,
      priority,
      deadline: new Date(matched.dueBy).getTime(),
      completionCriteria: criteriaFromCase(matched),
      relevantEntities: entitiesFromCase(matched),
      context: contextFromCase(matched),
    };
    // A matched outcome is grounded in a real record, so its title, criteria
    // and state come from that record — not from a model's guess.
    return base;
  }

  /* No external record matched — build a honest, generic loop. */
  const counterpartyName = namedCounterparty;
  const context: LoopContext = {};
  if (counterpartyName) context.counterpartyName = counterpartyName;
  if (explicitReference) context.reference = explicitReference;
  if (amount !== undefined) context.amount = amount;

  const relevantEntities: RelevantEntity[] = [];
  if (counterpartyName) {
    relevantEntities.push({ id: "entity_counterparty", kind: "PERSON", label: counterpartyName });
  }
  if (explicitReference) {
    relevantEntities.push({ id: "entity_reference", kind: "DOCUMENT", label: explicitReference });
  }

  const base: IntakeResult = {
    title: counterpartyName ? `${counterpartyName} request` : "Open outcome",
    desiredOutcome: outcome,
    description: counterpartyName
      ? `OpenLoop is responsible for following “${outcome}” through with ${counterpartyName} until it is actually resolved.`
      : `OpenLoop is responsible for following this outcome through until it is actually resolved.`,
    priority: rule.archetype === "generic" ? "NORMAL" : "HIGH",
    deadline: null,
    completionCriteria: rule.criteria,
    relevantEntities,
    context,
  };
  return resolved.simulated ? base : refine(base, outcome, resolved);
}

async function refine(base: IntakeResult, outcome: string, resolved: ResolvedModel): Promise<IntakeResult> {
  try {
    const agent = new Agent({
      model: resolved.model,
      systemPrompt: INTAKE_SYSTEM,
      printer: false,
      retryStrategy: null,
      structuredOutputSchema: IntakeSchema,
    });
    const result = await agent.invoke(outcome);
    const refined = result.structuredOutput as z.infer<typeof IntakeSchema> | undefined;
    if (!refined) return base;
    return {
      ...base,
      title: refined.title,
      description: refined.description,
      priority: refined.priority,
      completionCriteria: refined.completionCriteria,
    };
  } catch (error) {
    console.warn("[openloop] intake refinement failed; using the deterministic structure", error);
    return base;
  }
}

