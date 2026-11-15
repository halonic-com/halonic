import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { WorkflowTestCase } from "../api.ts";
import { pathSplit, testRows, testSummary } from "./test-lines.ts";

const passed: WorkflowTestCase = { name: "spam", input: "{}", result: { passed: true } };
const failed: WorkflowTestCase = {
  name: "personal mail",
  input: "{}",
  result: { passed: false, failure: 'Expected to end in "archive", ended in "reply".' },
};
const fresh: WorkflowTestCase = { name: "invoice", input: "{}" };

verifies("workflows.tests.page", () => {
  it("counts passes and says when they last ran", () => {
    const ranAt = new Date(2026, 10, 9, 10, 42).toISOString();
    expect(testSummary({ cases: [passed, passed, failed], ranAt }, undefined, "en-GB")).toBe(
      "2 of 3 pass · 10:42",
    );
  });

  it("says a test that never ran is not run yet", () => {
    expect(testSummary({ cases: [fresh, fresh, fresh] })).toBe("3 tests, not run yet");
    expect(testSummary({ cases: [fresh] })).toBe("1 test, not run yet");
  });

  it("counts up while the tests run, with no time", () => {
    const ranAt = new Date(2026, 10, 9, 10, 42).toISOString();
    expect(testSummary({ cases: [passed, passed, failed], ranAt }, { done: 1 })).toBe(
      "1 of 3 done",
    );
  });

  it("gives each row its state and a failed row its sentence", () => {
    expect(testRows([passed, failed, fresh]).map((row) => [row.glyph, row.state])).toEqual([
      ["✓", "passed"],
      ["✕", "failed"],
      ["·", "not-run"],
    ]);
    expect(testRows([failed])[0]?.failure).toBe('Expected to end in "archive", ended in "reply".');
  });

  it("shows a still dot for each row without a result while the tests run", () => {
    const rows = testRows([passed, failed, fresh], new Map([[0, false]]));
    expect(rows.map((row) => row.state)).toEqual(["failed", "waiting", "waiting"]);
  });

  it("finds the first difference and says it with the step counted from 1", () => {
    expect(pathSplit(["read", "classify", "archive"], ["read", "classify", "reply"])).toEqual({
      at: 2,
      sentence: 'It went another way at step 3: "reply" instead of "archive".',
    });
  });

  it("says when a run stops early or goes on too long, and nothing for equal paths", () => {
    expect(pathSplit(["a", "b"], ["a"])?.sentence).toBe('It stopped at step 2, before "b".');
    expect(pathSplit(["a"], ["a", "b"])?.sentence).toBe(
      'It went on at step 2: "b" after the expected end.',
    );
    expect(pathSplit(["a", "b"], ["a", "b"])).toBeUndefined();
  });
});
