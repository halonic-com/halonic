import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { AttemptStep } from "./attempt-step.ts";
import { countChangedLines } from "./attempt-step.ts";
import { calibratedOn, endOfRunModel, inRunModels } from "./coefficients.ts";
import { endOfRunFeatures, scoreFinishedAttempt } from "./end-of-run.ts";
import { endOfRunSelftest } from "./end-of-run-selftest.ts";
import { checkpointMinutes, checkpointTags, scoreRunningAttempt } from "./in-run.ts";
import { inRunSelftest } from "./in-run-selftest.ts";
import { type LogisticModel, scoreWith } from "./logistic-model.ts";

const twoFeatureModel: LogisticModel = {
  features: ["turns", "no_edit"],
  logged: ["turns"],
  logFloor: 0,
  mean: [1, 0.5],
  scale: [2, 0.5],
  coef: [-1, 2],
  intercept: 0.25,
  threshold: 0.5,
};

const diff = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,2 @@",
  "-old",
  "+new",
  " same",
].join("\n");

const steps: AttemptStep[] = [
  { t: 5, step: 1, tool: "(step)", tokensIn: 1000, tokensOut: 50 },
  { t: 20, step: 1, tool: "read", read: ["src/a.ts"] },
  { t: 60, step: 2, tool: "shell", command: "cat src/a.ts && head src/b.ts" },
  { t: 90, step: 2, tool: "(step)", tokensIn: 2000, tokensOut: 80 },
  { t: 150, step: 3, tool: "edit", edited: ["src/a.ts"] },
  { t: 200, step: 4, tool: "shell", command: "pnpm test --filter x", failed: 3 },
  { t: 260, step: 5, tool: "edit", edited: ["src/a.ts", "src/a.test.ts"] },
  { t: 330, step: 6, tool: "shell", command: "pnpm exec tsc --noEmit", failed: 1 },
  { t: 700, step: 7, tool: "write", edited: ["src/c.ts"] },
];

describe("scoreWith", () => {
  it("scales, logs and weighs each feature, then applies the logistic", () => {
    const z = 0.25 + (-1 * (Math.log1p(3) - 1)) / 2 + (2 * (1 - 0.5)) / 0.5;
    const score = scoreWith(twoFeatureModel, { turns: 3, no_edit: 1 });
    expect(score.pFail).toBeCloseTo(1 / (1 + Math.exp(-z)), 12);
    expect(score.flagged).toBe(true);
  });

  it("counts a missing or non-finite feature as 0", () => {
    expect(scoreWith(twoFeatureModel, { no_edit: Number.NaN })).toEqual(
      scoreWith(twoFeatureModel, {}),
    );
  });
});

const finishedAttempt = {
  steps,
  diff,
  seconds: 1,
  exitCode: 0,
  timedOut: false,
  promptChars: 1,
};

verifies("retry-detectors.end-of-run", () => {
  describe("countChangedLines", () => {
    it("counts + and - lines inside hunks only", () => {
      expect(countChangedLines(diff)).toBe(2);
    });
  });

  describe("endOfRunFeatures", () => {
    it("reads turns, tool counts and the diff from the attempt", () => {
      const features = endOfRunFeatures({
        steps,
        diff,
        seconds: 712,
        exitCode: 0,
        timedOut: false,
        promptChars: 900,
      });
      expect(features).toMatchObject({
        turns: 7,
        shell: 3,
        read: 1,
        edit: 2,
        write: 1,
        grep: 0,
        changed_lines: 2,
        agent_seconds: 712,
        timed_out: 0,
        exit_nonzero: 0,
        is_error: 0,
        no_edit: 0,
        prompt_chars: 900,
      });
      expect(features["diff_vs_est"]).toBeCloseTo(Math.log(3 / 50), 12);
    });

    it("flags an attempt with no edits, a timeout and a failed exit", () => {
      const features = endOfRunFeatures({
        steps: [],
        diff: "",
        seconds: 1800,
        exitCode: 1,
        timedOut: true,
        promptChars: 0,
      });
      expect(features).toMatchObject({ no_edit: 1, timed_out: 1, exit_nonzero: 1, turns: 0 });
    });
  });
});

verifies("retry-detectors.in-run", () => {
  describe("checkpointTags", () => {
    it("sees only the steps up to the checkpoint", () => {
      const tags = checkpointTags(steps, 3);
      expect(tags).toMatchObject({
        steps: 3,
        elapsed_s: 150,
        edited_any: 1,
        first_edit_t: 150,
        test_runs: 0,
        last_failed: -1,
      });
    });

    it("tracks edits, reads, tests and tokens by minute 6", () => {
      const tags = checkpointTags(steps, 6, new Set(["src/a.test.ts"]));
      expect(tags).toEqual({
        steps: 6,
        elapsed_s: 330,
        shell_calls: 3,
        edited_any: 1,
        first_edit_t: 150,
        files_edited: 2,
        max_edits_same_file: 2,
        max_reads_same_file: 2,
        since_last_edit_s: 70,
        test_runs: 2,
        typecheck_runs: 1,
        tests_ran: 1,
        last_failed: 1,
        failed_trend: -2,
        test_files_edited: 1,
        existing_tests_edited: 1,
        snapshot_edited: 0,
        tokens_in: 3000,
        tokens_out: 130,
      });
    });

    it("uses -1 for tags with no value yet", () => {
      expect(checkpointTags([], 3)).toMatchObject({
        first_edit_t: -1,
        last_failed: -1,
        elapsed_s: 0,
        steps: 0,
      });
    });
  });
});

verifies("retry-detectors.end-of-run", () => {
  describe("the shipped coefficients", () => {
    it("name every feature the extractors produce", () => {
      const endNames = Object.keys(
        endOfRunFeatures({ steps, diff, seconds: 1, exitCode: 0, timedOut: false, promptChars: 1 }),
      );
      expect(endNames).toEqual(expect.arrayContaining([...endOfRunModel.features]));
      for (const minute of checkpointMinutes) {
        expect(Object.keys(checkpointTags(steps, minute))).toEqual(
          expect.arrayContaining([...inRunModels[minute].features]),
        );
      }
    });

    it("flag nothing while a model is an untrained placeholder", () => {
      const models = [endOfRunModel, ...checkpointMinutes.map((minute) => inRunModels[minute])];
      for (const model of models.filter((m) => !m.trained)) {
        expect(
          scoreWith(
            model,
            endOfRunFeatures({
              steps,
              diff,
              seconds: 1,
              exitCode: 1,
              timedOut: true,
              promptChars: 1,
            }),
          ),
        ).toEqual({ pFail: 0.5, flagged: false });
      }
    });

    it("match the Python model on every selftest case", () => {
      expect(endOfRunSelftest.length > 0 || !endOfRunModel.trained).toBe(true);
      for (const c of endOfRunSelftest)
        expect(scoreWith(endOfRunModel, c.features).pFail).toBeCloseTo(c.pFail, 3);
      for (const minute of checkpointMinutes) {
        for (const c of inRunSelftest[minute])
          expect(scoreWith(inRunModels[minute], c.features).pFail).toBeCloseTo(c.pFail, 3);
      }
    });

    it("score attempts through the public helpers", () => {
      expect(
        scoreFinishedAttempt({ ...finishedAttempt, setup: calibratedOn }, twoFeatureModel),
      ).toMatchObject({ kind: "scored", flagged: false });
      expect(scoreRunningAttempt(steps, 3, calibratedOn)).toMatchObject({ kind: "scored" });
    });
  });
});

verifies("retry-detectors.calibration", () => {
  describe("the calibrated setup", () => {
    const otherModel = { ...calibratedOn, model: "another-model" };
    const otherProvider = { ...calibratedOn, provider: "another-provider" };

    it("is the setup the shipped coefficients were fitted on", () => {
      expect(calibratedOn).toEqual({
        agent: "opencode",
        model: "deepseek-v4.1-flash",
        provider: "deepinfra-fp8",
      });
    });

    it("refuses a finished attempt from another model or provider", () => {
      for (const setup of [otherModel, otherProvider]) {
        expect(scoreFinishedAttempt({ ...finishedAttempt, setup })).toEqual({
          kind: "refused",
          calibratedOn,
        });
      }
    });

    it("refuses a running attempt from another agent", () => {
      expect(scoreRunningAttempt(steps, 3, { ...calibratedOn, agent: "another-agent" })).toEqual({
        kind: "refused",
        calibratedOn,
      });
    });
  });
});
