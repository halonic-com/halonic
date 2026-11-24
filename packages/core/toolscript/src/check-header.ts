import { type StepperRisk, stepperRisks } from "@halonicjs/action-steppers";
import { formatPath, parse } from "@halonicjs/schema-kit";
import { type Header, headerSchema } from "./header.ts";

/** What `checkHeader` needs to know that the header can't say about itself. */
export interface HeaderCheckContext {
  /** The risk of a reviewed capability or step type from the registry, or undefined when it has none. */
  riskOf(reference: string): StepperRisk | undefined;
  /** True when the script's file exports a `run` function. */
  hasRun: boolean;
}

/** The result of `checkHeader`: the header, or every reason it was refused. */
export type HeaderCheck =
  | { ok: true; header: Header; requiredRisk: StepperRisk }
  | { ok: false; reasons: string[] };

function rank(risk: StepperRisk): number {
  return stepperRisks.indexOf(risk);
}

interface CalledReference {
  reference: string;
  /** Set for a `browser` block, which always counts as `admin`; otherwise the registry says. */
  fixedRisk?: StepperRisk;
}

/** Every capability or step type a header calls, from `uses` and its `steps`. */
function calledReferences(header: Header): CalledReference[] {
  const called: CalledReference[] = header.uses.map((reference) => ({ reference }));
  for (const block of header.steps ?? []) {
    if (block.kind === "browser") {
      called.push({ reference: "a browser block", fixedRisk: "admin" });
      if (block.check !== undefined) called.push({ reference: block.check.ref });
    } else {
      called.push({ reference: block.ref });
    }
  }
  return called;
}

function riskReasons(header: Header, context: HeaderCheckContext): [string[], StepperRisk] {
  const reasons: string[] = [];
  let required: StepperRisk = "routine";
  for (const { reference, fixedRisk } of calledReferences(header)) {
    const risk = fixedRisk ?? context.riskOf(reference);
    if (risk === undefined) {
      reasons.push(`${reference} is not in the capability registry`);
    } else if (rank(risk) > rank(required)) {
      required = risk;
    }
  }
  if (rank(header.risk) < rank(required)) {
    reasons.push(
      `risk: ${header.risk} is lower than ${required}, the highest risk of what it uses`,
    );
  }
  return [reasons, required];
}

/**
 * Checks a header against its schema and against the registry and the script:
 * `risk` is at least the highest risk of everything it uses, and `steps` and
 * `run` are never used together. Returns every reason, each naming its place.
 *
 * @example
 * const checked = checkHeader(header, { riskOf: (ref) => risks[ref], hasRun: true });
 */
export function checkHeader(value: unknown, context: HeaderCheckContext): HeaderCheck {
  const parsed = parse(headerSchema, value);
  if (!parsed.ok) {
    return {
      ok: false,
      reasons: parsed.error.map((issue) => `${formatPath(issue.path)}: ${issue.message}`),
    };
  }
  const header = parsed.value;
  const reasons: string[] = [];
  if (header.steps !== undefined && context.hasRun) {
    reasons.push("steps and run can't be used together");
  }
  if (header.steps === undefined && !context.hasRun) {
    reasons.push("a ToolScript needs either steps or a run function");
  }
  const [riskProblems, requiredRisk] = riskReasons(header, context);
  reasons.push(...riskProblems);
  return reasons.length === 0 ? { ok: true, header, requiredRisk } : { ok: false, reasons };
}
