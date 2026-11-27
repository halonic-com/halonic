import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeCatalog } from "./acme-catalog.fixture.ts";
import { manualFormProblems, renderManualGuide } from "./manual-guide.ts";
import { stepperRequestFormat } from "./stepper-request.ts";
import { planResume, type StepOutcome } from "./stepper-resume.ts";
import type {
  GuidedStep,
  SignInPhase,
  SignInStep,
  StepperCatalog,
  StepperDefinition,
} from "./stepper-types.ts";
import { strictParameters } from "./strict-parameters.ts";
import { validateStepperRequest } from "./validate-stepper-request.ts";

const page = "https://{host}/";

function part(phase: SignInPhase, instruction: string, url = page): SignInStep {
  return {
    kind: "sign-in",
    service: "paperclip",
    phase,
    manual: { url, instructions: [instruction] },
  };
}

const signInSteps = [
  part("start", "In Studio, open Settings and start a sign-in."),
  part("approve", "Check the code matches, then click Approve."),
  part("keep", "Wait until Studio says it's signed in."),
  part("test", "Check who Studio says is signed in."),
];

function definitionWith(steps: StepperDefinition["steps"]): StepperDefinition {
  return {
    id: "paperclip.sign-in-example",
    version: 1,
    service: "paperclip",
    title: "Sign in to Paperclip",
    summary: "Signs in.",
    risk: "admin",
    parameters: strictParameters({ host: { kind: "text", pattern: /^[a-z0-9.-]{1,253}$/ } }),
    steps,
    targets: () => [],
    preview: () => steps.map(() => "A part of the sign-in."),
  };
}

function guideOf(definition: StepperDefinition): string {
  const catalog: StepperCatalog = {
    ...acmeCatalog,
    definition: (id, version) =>
      id === definition.id && version === definition.version ? definition : undefined,
  };
  const request = JSON.stringify({
    format: stepperRequestFormat,
    title: "Connect acme",
    reason: "A new computer.",
    blocks: [
      { kind: "use", ref: `${definition.id}@1`, parameters: { host: "paperclip.acme.example" } },
    ],
  });
  const checked = validateStepperRequest(request, catalog);
  if (!checked.ok) throw new Error(checked.error.join("; "));
  return renderManualGuide(checked.value, catalog);
}

const outcomes = (entries: ReadonlyArray<[number, StepOutcome]>) => new Map(entries);

verifies("action-steppers.sign-in-step", () => {
  describe("the manual guide of a sign-in", () => {
    it("says to open the connection's page once, then each part's instructions", () => {
      expect(guideOf(definitionWith(signInSteps))).toBe(
        [
          "`Connect acme`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://paperclip.acme.example/",
          "2. In Studio, open Settings and start a sign-in.",
          "3. Check the code matches, then click Approve.",
          "4. Wait until Studio says it's signed in.",
          "5. Check who Studio says is signed in.",
          "",
        ].join("\n"),
      );
    });

    it("opens a page again when a part is on another page", () => {
      const steps = [signInSteps[0], part("approve", "Click Approve.", "https://{host}/approve")];
      const lines = guideOf(definitionWith(steps as SignInStep[])).split("\n");
      expect(lines.filter((line) => line.includes(" Open "))).toEqual([
        "1. Open https://paperclip.acme.example/",
        "3. Open https://paperclip.acme.example/approve",
      ]);
    });
  });

  describe("manualFormProblems", () => {
    it("names a sign-in part with no manual form, a page that isn't https or no instruction", () => {
      const missing = { kind: "sign-in", service: "paperclip", phase: "start" } as SignInStep;
      const http = part("approve", "Click Approve.", "http://{host}/");
      const empty: SignInStep = { ...part("keep", ""), manual: { url: page, instructions: [] } };
      expect(
        manualFormProblems(definitionWith([missing, http, empty, signInSteps[3] as SignInStep])),
      ).toEqual([
        "paperclip.sign-in-example@1 step 1: a sign-in step needs a manual form",
        "paperclip.sign-in-example@1 step 2: the manual form's page must be an https address",
        "paperclip.sign-in-example@1 step 3: the manual form needs at least one instruction",
      ]);
      expect(manualFormProblems(definitionWith(signInSteps))).toEqual([]);
    });
  });

  describe("planResume", () => {
    it("runs the whole sign-in again when a part of it is left", () => {
      const plan = planResume(
        signInSteps,
        outcomes([
          [1, "succeeded"],
          [2, "succeeded"],
          [3, "failed"],
        ]),
      );
      expect(plan).toEqual({ kind: "run", steps: [1, 2, 3, 4] });
    });

    it("leaves a finished sign-in alone and runs only the steps after it", () => {
      const guided: GuidedStep = {
        kind: "guided",
        address: "https://github.com/acme/app/settings",
        instructions: ["Check the settings."],
        checkedOn: "2026-11-26",
      };
      const finished = outcomes([
        [1, "succeeded"],
        [2, "succeeded"],
        [3, "succeeded"],
        [4, "skipped"],
      ]);
      expect(planResume([...signInSteps, guided], finished)).toEqual({ kind: "run", steps: [5] });
    });
  });

  it("has no address or route field of its own", () => {
    expect(Object.keys(part("approve", "Click Approve.")).sort()).toEqual(
      ["kind", "manual", "phase", "service"].sort(),
    );
  });
});
