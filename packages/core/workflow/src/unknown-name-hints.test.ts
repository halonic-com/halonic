import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { likelyName } from "./near-name.ts";
import { workflowOf } from "./test/workflow.spec.ts";
import { validateWorkflow } from "./validate.ts";
import type { ValidateOptions } from "./workflow-issue.ts";

/** A workflow `classify` → `review` → `done`, with the step `classify` changed as given. */
const sortWorkflow = (classify: Record<string, unknown>) =>
  workflowOf({
    id: "sort",
    name: "Sort",
    initial: "classify",
    states: {
      classify: { agent: "sorter", on: [{ to: "review" }], ...classify },
      review: { agent: "sorter", on: [{ to: "done" }] },
      done: { type: "final" },
    },
  });

/** Each issue as "code at path: message". */
function found(classify: Record<string, unknown>, options: ValidateOptions = {}): string[] {
  return validateWorkflow(sortWorkflow(classify), options).map(
    (issue) => `${issue.code} at ${issue.path.join(".")}: ${issue.message}`,
  );
}

verifies("workflow.unknown-name-hints", () => {
  describe("an unknown agent", () => {
    const agents = ["sorter", "writer"];

    it("guesses the agent whose name differs only in case", () => {
      expect(found({ agent: "Sorter" }, { agents })).toEqual([
        'unknown-agent at states.classify.agent: "classify" uses unknown agent "Sorter". Did you mean "sorter"?',
      ]);
    });

    it("guesses a close spelling", () => {
      expect(found({ agent: "sortr" }, { agents })).toEqual([
        'unknown-agent at states.classify.agent: "classify" uses unknown agent "sortr". Did you mean "sorter"?',
      ]);
    });

    it("says which hub an agent of another hub is in", () => {
      const options = { agents, agentHubs: { reporter: "reports" } };
      expect(found({ agent: "reporter" }, options)).toEqual([
        `unknown-agent at states.classify.agent: "classify" uses unknown agent "reporter". reporter is in the hub reports; a workflow can only use its own hub's agents.`,
      ]);
    });

    it("guesses for a parallel step's branch too", () => {
      const classify = {
        type: "parallel",
        agent: undefined,
        branches: { one: { agent: "SORTER" } },
      };
      expect(found(classify, { agents })).toEqual([
        'unknown-agent at states.classify.branches.one.agent: Branch "one" of "classify" uses unknown agent "SORTER". Did you mean "sorter"?',
      ]);
    });

    it("keeps the old message without a likely agent", () => {
      expect(found({ agent: "ghost" }, { agents })).toEqual([
        'unknown-agent at states.classify.agent: "classify" uses unknown agent "ghost"',
      ]);
    });
  });

  describe("an unknown state", () => {
    it("guesses a close spelling, and the states after it are reached", () => {
      expect(found({ on: [{ to: "reveiw" }] })).toEqual([
        'unknown-target at states.classify.on.0.to: "classify" goes to unknown state "reveiw". Did you mean "review"?',
      ]);
    });

    it("leaves the states unreached without a likely state", () => {
      expect(found({ on: [{ to: "nowhere" }] })).toEqual([
        'unknown-target at states.classify.on.0.to: "classify" goes to unknown state "nowhere"',
        'unreachable at states.review: "review" can never be reached',
        'unreachable at states.done: "done" can never be reached',
      ]);
    });
  });

  describe("the likely name", () => {
    it("has no guess between two names of the same letters", () => {
      expect(likelyName("sorter", ["Sorter", "SORTER"])).toBeUndefined();
    });

    it("has no guess between two close spellings", () => {
      expect(likelyName("sorte", ["sorter", "sorted"])).toBeUndefined();
    });
  });
});
