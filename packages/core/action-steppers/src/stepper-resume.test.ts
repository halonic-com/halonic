import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { planResume, type StepOutcome } from "./stepper-resume.ts";
import type { GuidedStep, InputStep, ScriptStep } from "./stepper-types.ts";

const tokenInput: InputStep = { kind: "input", name: "token", label: "Token", secret: true };
const addVariable: GuidedStep = {
  kind: "guided",
  address: "https://github.com/{owner}/{repo}/settings/variables/actions/new",
  instructions: ["Type the name and value.", "Select Add variable."],
  checkedOn: "2026-11-24",
};
const setRuleset: ScriptStep = {
  kind: "script",
  ref: "github.set-ruleset",
  manual: {
    url: "https://github.com/{owner}/{repo}/settings/rules",
    instructions: ["Open the ruleset."],
  },
};

function outcomes(entries: ReadonlyArray<[number, StepOutcome]>): ReadonlyMap<number, StepOutcome> {
  return new Map(entries);
}

verifies("action-steppers.stepper-resume", () => {
  describe("planResume", () => {
    it("asks an input again and reopens a failed guided step", () => {
      const plan = planResume(
        [tokenInput, addVariable],
        outcomes([
          [1, "succeeded"],
          [2, "failed"],
        ]),
      );

      expect(plan).toEqual({ kind: "run", steps: [1, 2] });
    });

    it("skips steps recorded as succeeded or skipped", () => {
      const plan = planResume(
        [addVariable, addVariable, addVariable],
        outcomes([
          [1, "succeeded"],
          [2, "skipped"],
        ]),
      );

      expect(plan).toEqual({ kind: "run", steps: [3] });
    });

    it("stops at a failed API step even after an earlier failed guided step", () => {
      const plan = planResume(
        [addVariable, setRuleset],
        outcomes([
          [1, "failed"],
          [2, "failed"],
        ]),
      );

      expect(plan).toEqual({
        kind: "stop",
        step: 2,
        reason: "may-have-happened",
        manual: setRuleset.manual,
      });
    });

    it("stops at a failed API step and links its page instead of repeating it", () => {
      const plan = planResume(
        [addVariable, setRuleset],
        outcomes([
          [1, "succeeded"],
          [2, "failed"],
        ]),
      );

      expect(plan).toEqual({
        kind: "stop",
        step: 2,
        reason: "may-have-happened",
        manual: setRuleset.manual,
      });
    });

    it("runs an API step that never started", () => {
      const plan = planResume([addVariable, setRuleset], outcomes([[1, "succeeded"]]));

      expect(plan).toEqual({ kind: "run", steps: [2] });
    });

    it("is finished when every step is done, whatever the inputs", () => {
      const plan = planResume([tokenInput, addVariable], outcomes([[2, "succeeded"]]));

      expect(plan).toEqual({ kind: "finished" });
    });
  });
});
