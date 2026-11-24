/**
 * Invented action requests for the stepper's tests, on the `acme` organisation and the
 * `acme.example` zone. Each is the view model the app service will hand the screen.
 */
import type {
  StepAction,
  StepOutcome,
  StepperActions,
  StepperStage,
  StepperView,
  StepRisk,
  StepView,
} from "../stepper-view.ts";

// Local time, so the dates read the same in every time zone. Tue 24 Nov 2026, 14:05.
const expiresAt = new Date(2026, 10, 24, 14, 5);

const toDo: StepOutcome = { kind: "to-do" };

function callAction(number: number): StepAction {
  return {
    kind: "call",
    call: {
      method: number === 1 ? "GET" : "POST",
      address: `https://api.github.com/repos/acme/app/actions/runs/123456/step-${number}`,
      body: number === 1 ? undefined : '{\n  "state": "approved"\n}',
    },
  };
}

function step(
  number: number,
  risk: StepRisk,
  preview: string,
  action: StepAction = callAction(number),
): StepView {
  return {
    number,
    preview,
    risk,
    action,
    manual: {
      address: "https://github.com/acme/app/actions/runs/123456",
      lines: [`Do step ${number} on the run's page`],
      check: "The run's page shows the new state",
    },
    hasCheck: number !== 3,
    outcome: toDo,
  };
}

/** Three routine steps to re-run a failed workflow on `acme/app`, all still to do. */
export function routineRequest(overrides: Partial<StepperView> = {}): StepperView {
  return {
    title: "Re-run the failed jobs of run 123456 on acme/app",
    service: "github",
    account: "acme-admin",
    touches: [{ kind: "target", service: "GitHub", target: "repository acme/app (Actions)" }],
    risk: "routine",
    expiresAt,
    requester: { name: "Chief", source: "Paperclip · Acme" },
    reason: "CI failed on a flaky test. Please re-run it.",
    steps: [
      step(1, "routine", "Checks that run 123456 has failed jobs"),
      step(2, "routine", "Re-runs the failed jobs of run 123456"),
      step(3, "routine", "Checks that the re-run started"),
    ],
    serviceDown: false,
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
      step(1, "routine", "Checks that run 123456 waits for the release environment"),
      step(2, "irreversible", "Approves the deployment of acme/app to release"),
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
      step(1, "routine", "Reads the ruleset on main today: 1 review"),
      step(2, "admin", "Changes the ruleset on main to 2 reviews"),
    ],
  });
}

/** The address of the on-demand browser step in {@link browserRequest}. */
export const projectPage = "https://console.cloud.google.com/projectcreate";

/**
 * An on-demand request: a browser step in the requester's own words with a paste-back field, then
 * a library browser step checked on 20 Nov.
 */
export function browserRequest(instructions: readonly string[] = ["Type acme-prod as the name"]) {
  return routineRequest({
    title: "Create the Google Cloud project acme-prod",
    risk: "admin",
    touches: [
      { kind: "target", service: "Google Cloud", target: "project acme-prod" },
      { kind: "page", address: projectPage },
    ],
    steps: [
      step(1, "admin", "Creates the project on Google Cloud's page", {
        kind: "browser",
        address: projectPage,
        instructions,
        source: { kind: "requester" },
        resultLabel: "Project ID",
      }),
      step(2, "admin", "Turns on billing for the project", {
        kind: "browser",
        address: "https://console.cloud.google.com/billing/linkedaccount",
        instructions: ["Pick the Acme billing account", "Click Set account"],
        source: { kind: "library", checkedOn: new Date(2026, 10, 20) },
      }),
    ],
  });
}

/** The request with its steps' outcomes replaced in order. */
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
  const record = (call: string) => {
    calls.push(call);
  };
  return {
    calls,
    runStep: (number) => record(`run ${number}`),
    runAll: () => record("run all"),
    decline: () => record("decline"),
    openPage: (address) => record(`open ${address}`),
    confirmBrowserStep: (number, result) => record(`done ${number} ${result ?? "-"}`),
    checkStep: (number) => record(`check ${number}`),
    markDoneByHand: (number) => record(`by hand ${number}`),
    signIn: () => record("sign in"),
    signInAgain: () => record("sign in again"),
  };
}
