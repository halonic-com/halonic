/**
 * Invented action requests for the stepper's tests, on the `acme` organisation and the
 * `acme.example` zone. Each is the view model the app service will hand the screen.
 */
import type {
  StepOutcome,
  StepperActions,
  StepperStage,
  StepperView,
  StepRisk,
  StepView,
} from "../stepper-view.ts";

// Local time, so the expiry reads the same in every time zone. Tue 24 Nov 2026, 14:05.
const expiresAt = new Date(2026, 10, 24, 14, 5);

function step(number: number, risk: StepRisk, preview: string, outcome: StepOutcome): StepView {
  return {
    number,
    preview,
    risk,
    call: {
      method: number === 1 ? "GET" : "POST",
      address: `https://api.github.com/repos/acme/app/actions/runs/123456/step-${number}`,
      body: number === 1 ? undefined : '{\n  "state": "approved"\n}',
    },
    outcome,
  };
}

const toDo: StepOutcome = { kind: "to-do" };

/** Three routine steps to re-run a failed workflow on `acme/app`, all still to do. */
export function routineRequest(overrides: Partial<StepperView> = {}): StepperView {
  return {
    title: "Re-run the failed jobs of run 123456 on acme/app",
    service: "github",
    account: "acme-admin",
    target: "acme/app",
    risk: "routine",
    expiresAt,
    requester: { kind: "agent", name: "Chief" },
    reason: "CI failed on a flaky test. Please re-run it.",
    steps: [
      step(1, "routine", "Checks that run 123456 has failed jobs", toDo),
      step(2, "routine", "Re-runs the failed jobs of run 123456", toDo),
      step(3, "routine", "Checks that the re-run started", toDo),
    ],
    stage: { kind: "ready" },
    ...overrides,
  };
}

/** Approving the `release` deployment of `acme/app`: its last step is irreversible. */
export function releaseRequest(overrides: Partial<StepperView> = {}): StepperView {
  return routineRequest({
    title: "Approve the deployment of acme/app to release",
    risk: "irreversible",
    steps: [
      step(1, "routine", "Checks that run 123456 waits for the release environment", toDo),
      step(2, "irreversible", "Approves the deployment of acme/app to release", toDo),
    ],
    ...overrides,
  });
}

/** A ruleset change on `acme/app`: an admin step, so the steps run one at a time. */
export function rulesetRequest(): StepperView {
  return routineRequest({
    title: "Require 2 reviews on main in acme/app",
    risk: "admin",
    steps: [
      step(1, "routine", "Reads the ruleset on main today: 1 review", toDo),
      step(2, "admin", "Changes the ruleset on main to 2 reviews", toDo),
    ],
  });
}

/** {@link routineRequest} with its steps' outcomes replaced in order. */
export function withOutcomes(view: StepperView, outcomes: readonly StepOutcome[]): StepperView {
  return {
    ...view,
    steps: view.steps.map((original, index) => ({
      ...original,
      outcome: outcomes[index] ?? original.outcome,
    })),
  };
}

/** {@link routineRequest} in another stage. */
export function inStage(stage: StepperStage, overrides: Partial<StepperView> = {}): StepperView {
  return routineRequest({ stage, ...overrides });
}

/** Actions that record every call, for the tests to read. */
export function recordingActions(): StepperActions & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    runStep: (number) => calls.push(`run ${number}`),
    runAll: () => calls.push("run all"),
    decline: () => calls.push("decline"),
    saveToken: (token) => calls.push(`token ${token.reveal()}`),
    signInAgain: () => calls.push("sign in again"),
  };
}
