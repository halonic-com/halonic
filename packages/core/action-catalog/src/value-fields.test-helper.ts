import type { StepperDefinition } from "@halonicjs/action-steppers";
import { parse } from "@halonicjs/schema-kit";

/** The names a request could try to smuggle a key's value in (task HAL-17553, Done when). */
export const valueNames = ["value", "secret", "key", "token"] as const;

/** Each of {@link valueNames} the definition's parameters accept next to valid ones: there must be none. Tests only. */
export function acceptedValueNames(
  definition: StepperDefinition,
  parameters: Record<string, string>,
): string[] {
  return valueNames.filter(
    (name) => parse(definition.parameters, { ...parameters, [name]: "sk-acme-0000" }).ok,
  );
}
