import {
  renderManualGuide,
  type StepperDefinition,
  stepperRequestFormat,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import { shippedCatalog } from "./catalog.ts";

/** The manual guide for one use of a shipped definition, built the way a card builds it. */
export function manualGuideOf(
  definition: StepperDefinition<Record<string, string | number>>,
  parameters: Record<string, string>,
): string {
  const request = JSON.stringify({
    format: stepperRequestFormat,
    title: "Set up acme",
    reason: "The acme launch needs it.",
    blocks: [{ kind: "use", ref: `${definition.id}@${definition.version}`, parameters }],
  });
  const checked = validateStepperRequest(request, shippedCatalog);
  if (!checked.ok) throw new Error(checked.error.join("; "));
  return renderManualGuide(checked.value, shippedCatalog);
}

/** What is wrong with the way a definition's guided steps open pages on `host`, in words; empty when nothing is. */
export function consoleStepProblems(
  definition: StepperDefinition<Record<string, string | number>>,
  host: "console.cloud.google.com" | "play.google.com",
): string[] {
  const problems: string[] = [];
  for (const step of definition.steps) {
    if (step.kind !== "guided") {
      problems.push(`a ${step.kind} step: only guided steps belong here`);
      continue;
    }
    if (!step.address.startsWith(`https://${host}/`)) problems.push(`address ${step.address}`);
    if (step.checkedOn !== "from docs") problems.push(`checkedOn ${step.checkedOn}`);
    if (step.result !== undefined && "secret" in step.result) problems.push("a secret result");
    if (step.result !== undefined && /secret|key|token|password/i.test(step.result.label)) {
      problems.push(`result label ${step.result.label}`);
    }
  }
  return problems;
}

/** The numbered lines of a manual guide. */
export function numberedLines(guide: string): string[] {
  return guide.split("\n").filter((line) => /^\d+\. /.test(line));
}
