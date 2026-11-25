import type { ActionOutcome } from "@halonicjs/events";
import type { StepperStage } from "../stepper-view.ts";

/** The screen's stage for a request whose record says it ended. */
export function endedStage(outcome: ActionOutcome): StepperStage {
  if (outcome === "declined") return { kind: "declined" };
  if (outcome === "expired") return { kind: "expired" };
  return { kind: "finished" };
}

/** How the user signs in to the service, from a click; a service without a sign-in can't run. */
export function signInStage(service: string, code: string | null): StepperStage {
  if (service === "github") return { kind: "sign-in", signIn: { service, code } };
  // The catalog's routes don't name a Cloudflare token's permissions yet, so the panel lists none.
  if (service === "cloudflare") return { kind: "sign-in", signIn: { service, permissions: [] } };
  return { kind: "not-available" };
}
