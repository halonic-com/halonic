import type { Step, StepperDefinition } from "@halonicjs/action-steppers";
import { err, ok, type Result } from "@halonicjs/std";

// The manual guide (architecture note on HAL-17491, 7.8): a definition's steps
// as numbered instructions someone can follow without Halonic. Built from the
// same steps the stepper runs, so the two can't drift. Only declarative steps
// have a manual form yet; API steps get theirs with the ToolScript ADR (7.9).

/** Said last, because no declarative step can be checked by Halonic yet. */
export const notCheckedLine =
  "Halonic can't check this: it's recorded as done by hand, not checked.";

const placeholder = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/** Fills `{name}` placeholders, or says which one has no value. */
function fill(
  template: string,
  parameters: Readonly<Record<string, string | number>>,
  encode: (value: string) => string,
): Result<string, string> {
  let missing: string | undefined;
  const text = template.replace(placeholder, (match, name: string) => {
    const value = parameters[name];
    if (value === undefined) {
      missing ??= name;
      return match;
    }
    return encode(String(value));
  });
  return missing === undefined ? ok(text) : err(`no value for {${missing}}`);
}

function stepLines(
  step: Step,
  parameters: Readonly<Record<string, string | number>>,
): Result<string[], string> {
  switch (step.kind) {
    case "guided": {
      const address = fill(step.address, parameters, encodeURIComponent);
      if (!address.ok) return address;
      const lines = [`Open ${address.value}`];
      for (const instruction of step.instructions) {
        const line = fill(instruction, parameters, (value) => value);
        if (!line.ok) return line;
        lines.push(line.value);
      }
      if (step.result !== undefined) lines.push(`Note ${step.result.label}.`);
      return ok(lines);
    }
    case "input":
      return ok([
        step.secret
          ? `Type ${step.label} only on the service's own page. Never paste it into a chat or a task.`
          : `Note ${step.label}.`,
      ]);
    case "script":
      return err(`the API step ${step.ref} has no manual form yet`);
  }
}

/**
 * The manual guide for a definition and its checked parameters: a numbered
 * list in Markdown, then {@link notCheckedLine}. It holds names and page
 * addresses only, never a secret value.
 *
 * @example
 * renderDefinitionGuide(definition, { owner: "acme", repo: "app" });
 * // ok("1. Open https://github.com/acme/app/settings\n2. Under **Social preview** …")
 */
export function renderDefinitionGuide(
  definition: StepperDefinition,
  parameters: Readonly<Record<string, string | number>>,
): Result<string, string> {
  const lines: string[] = [];
  for (const [index, step] of definition.steps.entries()) {
    const stepText = stepLines(step, parameters);
    if (!stepText.ok)
      return err(`${definition.id}@${definition.version} step ${index + 1}: ${stepText.error}`);
    lines.push(...stepText.value);
  }
  const numbered = lines.map((line, index) => `${index + 1}. ${line}`);
  return ok([...numbered, "", notCheckedLine].join("\n"));
}
