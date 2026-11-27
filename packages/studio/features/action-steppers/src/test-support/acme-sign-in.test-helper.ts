/**
 * An invented Paperclip sign-in stepper for the run's tests: the `acme`
 * Paperclip on `paperclip.acme.example`, a stand-in board and keychain, and a
 * clock the test moves. Never a real workspace or key. The stand-ins themselves
 * come from `testing-contracts`, which only test files may import.
 */
import {
  type SignInPhase,
  type StepperCatalog,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import { type ActionItem, reviewActionItem } from "../review/action-item-review.ts";
import type { ConnectionsRead } from "../review/paperclip-host.ts";
import type { ServiceSignInView, StepperView } from "../stepper-view.ts";
import { acmeSource, actionItem } from "./acme-catalog.test-helper.ts";
import { allowsAcme } from "./acme-run.test-helper.ts";

const phases: readonly SignInPhase[] = ["start", "approve", "keep", "test"];

/** Connects Studio to the `acme` Paperclip, as `paperclip.connect-and-test@1` does. */
const connectAndTest: StepperDefinition<Record<string, string | number>> = {
  id: "acme.paperclip-sign-in",
  version: 1,
  service: "paperclip",
  title: "Connect Studio to Paperclip and test the sign-in",
  summary: "Signs in to Paperclip.",
  risk: "admin",
  parameters: strictParameters({
    host: { kind: "text", pattern: /^[a-z0-9.-]{1,253}$/ },
    connection: { kind: "text", pattern: /^[a-z]{1,20}$/ },
    mode: { kind: "choice", options: ["connect", "test"] },
  }),
  steps: phases.map((phase) => ({
    kind: "sign-in",
    service: "paperclip",
    phase,
    manual: { url: "https://{host}/", instructions: ["Follow Studio."] },
  })),
  targets: (parameters) => [
    { service: "paperclip", kind: "Paperclip", name: String(parameters["host"]) },
  ],
  preview: () => phases.map((phase) => `The ${phase} part.`),
};

/** A catalog with only the sign-in stepper. */
export const signInCatalog: StepperCatalog = {
  definition: (id, version) =>
    id === connectAndTest.id && version === 1 ? connectAndTest : undefined,
  stepType: () => undefined,
  browserOrigins: [],
  route: () => undefined,
};

/** The Paperclips the user connected: only the `acme` one, with its key on this computer. */
export const acmePaperclips: ConnectionsRead = {
  kind: "read",
  paperclips: [{ host: "paperclip.acme.example", hasKey: true }],
};

/** The request's id in its record. */
export const signInRequest = "paperclip:acme/item-1";

/** The approval page the stand-in Paperclip answers for the first sign-in. */
export const acmeApprovalPage = "https://paperclip.acme.example/cli-auth/challenge-1";

/** The request for a sign-in to the `acme` connection, a test one unless `mode` says otherwise. */
export function signInItem(mode: "connect" | "test" = "test"): ActionItem {
  return actionItem({
    definition: connectAndTest.id,
    version: 1,
    parameters: { host: "paperclip.acme.example", connection: "acme", mode },
    expires: "2026-11-27T12:00:00.000Z",
  });
}

/** The stepper's view once step 1 started a sign-in that shows `signIn`. */
export function signInView(signIn: ServiceSignInView, now: Date): StepperView {
  const review = reviewActionItem(signInItem(), acmeSource, {
    catalog: signInCatalog,
    policy: allowsAcme,
    now,
    paperclips: acmePaperclips,
  });
  if (review.kind !== "stepper") throw new Error(review.reasons.join("; "));
  const steps = review.view.steps.map((step) =>
    step.number === 1 ? { ...step, outcome: { kind: "succeeded" as const } } : step,
  );
  return { ...review.view, steps, stage: { kind: "ready" }, serviceSignIn: signIn };
}
