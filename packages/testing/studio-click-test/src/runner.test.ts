import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fakeStudio } from "./fake-studio.test-helper.ts";
import { allPassed, resultsMarkdown } from "./results.ts";
import { type RestartApp, runSteps, type Step, type StepOutcome } from "./runner.ts";

function step(id: string, outcome: StepOutcome | Error, needs?: string[]): Step {
  return {
    id,
    title: `Step ${id}`,
    ...(needs === undefined ? {} : { needs }),
    run: async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}

const sameApp: RestartApp = async () => fakeStudio().context;

verifies("studio-click-test.results", () => {
  describe("runSteps", () => {
    it("restarts the app after a failure and goes on, with a screenshot per step that ran", async () => {
      const saved: string[] = [];
      let restarts = 0;
      const results = await runSteps(
        [
          step("a", { passed: true }),
          step("b", { passed: false, code: "LIST_FAILED", note: "blank" }),
          step("c", { passed: true }),
        ],
        fakeStudio().context,
        async (fileName) => {
          saved.push(fileName);
        },
        async () => {
          restarts += 1;
          return fakeStudio().context;
        },
      );
      expect(results.map((result) => [result.verdict, result.code])).toEqual([
        ["passed", undefined],
        ["failed", "LIST_FAILED"],
        ["passed", undefined],
      ]);
      expect(saved).toEqual(["01-a.png", "02-b.png", "03-c.png"]);
      expect(restarts).toBe(1);
      expect(allPassed(results)).toBe(false);
    });

    it("skips a step whose needed step failed", async () => {
      const results = await runSteps(
        [
          step("a", { passed: false, code: "NOT_APPROVED", note: "" }),
          step("b", { passed: true }, ["a"]),
        ],
        fakeStudio().context,
        async () => undefined,
        sameApp,
      );
      expect(results[1]).toMatchObject({ verdict: "skipped", note: "needs step 1" });
    });

    it("marks the rest not run, with the reason, when the app won't restart", async () => {
      const results = await runSteps(
        [step("a", { passed: false, code: "NO_CHAT", note: "" }), step("b", { passed: true })],
        fakeStudio().context,
        async () => undefined,
        async () => {
          throw new Error("DevTools never answered");
        },
      );
      expect(results[1]).toMatchObject({
        verdict: "not run",
        note: "the app didn't restart after step 1: DevTools never answered",
      });
    });

    it("fails a step that throws as STEP_ERROR, and notes a screenshot that couldn't be saved", async () => {
      const results = await runSteps(
        [step("a", new Error("session gone"))],
        fakeStudio().context,
        async () => {
          throw new Error("disk full");
        },
        sameApp,
      );
      expect(results[0]).toMatchObject({
        verdict: "failed",
        code: "STEP_ERROR",
        note: "session gone (no screenshot: disk full)",
      });
    });
  });

  describe("resultsMarkdown", () => {
    it("names every failing step and its code, and escapes the table's cells", async () => {
      const results = await runSteps(
        [
          step("a", { passed: false, code: "ENGINE_NOT_ANSWERING", note: "a | b\nc" }),
          step("b", { passed: false, code: "LIST_FAILED", note: "" }),
        ],
        fakeStudio().context,
        async () => undefined,
        sameApp,
      );
      const table = resultsMarkdown(results, "9115b95");
      expect(table).toContain(
        "2 of 2 steps failed: step 1 (Step a): ENGINE_NOT_ANSWERING; step 2 (Step b): LIST_FAILED.",
      );
      expect(table).toContain(
        "| 1 | Step a | ❌ failed | ENGINE_NOT_ANSWERING | a \\| b<br>c | 01-a.png |",
      );
    });

    it("says all steps passed, and allPassed agrees", async () => {
      const results = await runSteps(
        [step("a", { passed: true })],
        fakeStudio().context,
        async () => undefined,
        sameApp,
      );
      expect(resultsMarkdown(results, "main")).toContain("All 1 steps passed.");
      expect(allPassed(results)).toBe(true);
      expect(allPassed([])).toBe(false);
    });
  });
});
