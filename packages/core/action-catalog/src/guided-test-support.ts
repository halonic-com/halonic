import {
  renderManualGuide,
  type StepperDefinition,
  stepperRequestFormat,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import { shippedCatalog } from "./catalog.ts";

type Parameters = Record<string, string | number>;

/** The manual guide of a request that uses one shipped definition once, as the card shows it. */
export function manualGuideOf(
  definition: StepperDefinition,
  parameters: Parameters,
  title: string,
): string {
  const request = JSON.stringify({
    format: stepperRequestFormat,
    title,
    reason: "Needed for the acme launch.",
    blocks: [{ kind: "use", ref: `${definition.id}@${definition.version}`, parameters }],
  });
  const checked = validateStepperRequest(request, shippedCatalog);
  if (!checked.ok) throw new Error(checked.error.join("; "));
  return renderManualGuide(checked.value, shippedCatalog);
}

/** The addresses of a definition's guided steps, filled in with checked parameters. */
export function guidedAddresses(definition: StepperDefinition, parameters: Parameters): string[] {
  return definition.steps.flatMap((step) =>
    step.kind === "guided"
      ? [
          step.address.replace(/\{(\w+)\}/g, (_, name: string) =>
            encodeURIComponent(String(parameters[name])),
          ),
        ]
      : [],
  );
}

/** Addresses that aren't `https` on one of the given hosts, with no port, user name, query or fragment. */
export function addressesOffOrigin(
  addresses: readonly string[],
  hosts: readonly string[],
): string[] {
  return addresses.filter((address) => {
    const host = /^https:\/\/([a-z0-9.-]+)\/[^?#@:]*$/.exec(address)?.[1];
    return host === undefined || !hosts.includes(host);
  });
}

/** Result fields and inputs a user could be asked to type a secret into: there must be none on a guided definition. */
export function secretFields(definition: StepperDefinition): string[] {
  return definition.steps.flatMap((step, index) => {
    if (step.kind === "input" && step.secret) return [`step ${index + 1} is a secret input`];
    if (
      step.kind === "guided" &&
      step.result !== undefined &&
      /key|token|password|secret|code/i.test(step.result.label)
    ) {
      return [`step ${index + 1} result \`${step.result.label}\` looks secret`];
    }
    return [];
  });
}
