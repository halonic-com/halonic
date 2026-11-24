import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentMessagingVersion, type InboxItem } from "./agent-messaging.ts";
import {
  type ActionResultAnswer,
  answerFitsItem,
  checkActionResultAnswer,
} from "./agent-messaging-actions.ts";

/** A request that approved a run in two steps, with invented `acme` data. */
const succeeded: ActionResultAnswer = {
  kind: "action-result",
  outcome: "succeeded",
  steps: [
    { step: 1, outcome: "skipped" },
    { step: 2, outcome: "succeeded", status: 201, kept: { id: 42, state: "approved", note: null } },
  ],
};

const failed: ActionResultAnswer = {
  kind: "action-result",
  outcome: "failed",
  steps: [
    {
      step: 1,
      outcome: "failed",
      status: 403,
      failure: "service-error",
      error: { untrusted: true, text: "Resource not accessible by integration" },
    },
  ],
};

const problemsOf = (value: unknown): readonly string[] => {
  const result = checkActionResultAnswer(value);
  return result.ok ? [] : result.problems;
};

const item: InboxItem = {
  id: "item-1",
  source: "source-1",
  from: { kind: "agent", agent: "agent-1", name: "Release bot" },
  question: "The release run waits for a reviewer.",
  options: [],
  createdAt: "2026-11-24T13:00:00.000Z",
  state: { kind: "open" },
};

const actionItem: InboxItem = {
  ...item,
  action: {
    definition: "github.approve-run",
    version: 1,
    parameters: { owner: "acme", repo: "app", runId: 123456 },
    expect: { headSha: "abc1234" },
    expires: "2026-11-25T13:00:00.000Z",
  },
};

verifies("ports.agent-messaging-actions", () => {
  it("is version 3 of the port", () => {
    expect(agentMessagingVersion).toBe(3);
  });

  it("takes a succeeded, a failed and a declined answer as they are", () => {
    const declined = { kind: "action-result", outcome: "declined", steps: [] };
    for (const answer of [succeeded, failed, declined]) {
      expect(checkActionResultAnswer(answer)).toEqual({ ok: true, answer });
    }
  });

  describe("refuses what isn't on the allow-list", () => {
    it("refuses an account name at the top or in a step, naming the field and not its value", () => {
      const atTop = problemsOf({ ...succeeded, account: "acme-admin" });
      const inStep = problemsOf({
        ...failed,
        steps: [{ ...failed.steps[0], account: "acme-admin" }],
      });

      expect(atTop).toEqual(["account: not allowed"]);
      expect(inStep).toEqual(["steps.0.account: not allowed"]);
      expect([...atTop, ...inStep].join(" ")).not.toContain("acme-admin");
    });

    it.each(["token", "headers", "body", "authorization", "cookie"])(
      "refuses a step with a %s field",
      (field) => {
        const step = { ...succeeded.steps[1], [field]: "x" };
        expect(problemsOf({ ...succeeded, steps: [step] })).toEqual([
          `steps.0.${field}: not allowed`,
        ]);
      },
    );

    it("refuses kept fields that hold an object, a list, long text or a name that isn't plain", () => {
      for (const kept of [
        { answer: { login: "acme-admin" } },
        { ids: [1, 2] },
        { note: "x".repeat(1001) },
        { "x-header": "1" },
      ]) {
        const step = { step: 1, outcome: "succeeded", status: 200, kept };
        expect(problemsOf({ ...succeeded, steps: [step] })).toHaveLength(1);
      }
    });

    it("refuses error text over 300 characters, or not marked untrusted", () => {
      const withError = (error: unknown) =>
        problemsOf({ ...failed, steps: [{ ...failed.steps[0], error }] });

      expect(withError({ untrusted: true, text: "x".repeat(301) })).toEqual([
        "steps.0.error: longer than 300",
      ]);
      expect(withError({ untrusted: true, text: "x".repeat(300) })).toEqual([]);
      expect(withError("Resource not accessible")).toEqual(["steps.0.error: not an object"]);
      expect(withError({ text: "Resource not accessible" })).toEqual([
        "steps.0.error: not marked untrusted",
      ]);
    });

    it("keeps kept fields to successes and why and the error to failures", () => {
      const keptOnFailure = { ...failed.steps[0], kept: { id: 1 } };
      const failureOnSuccess = { ...succeeded.steps[1], failure: "refused" };
      const failedWithoutWhy = { step: 1, outcome: "failed" };

      expect(problemsOf({ ...failed, steps: [keptOnFailure] })).toEqual([
        "steps.0.kept: only for succeeded",
      ]);
      expect(problemsOf({ ...succeeded, steps: [failureOnSuccess] })).toEqual([
        "steps.0.failure: only for failed",
      ]);
      expect(problemsOf({ ...failed, steps: [failedWithoutWhy] })).toEqual([
        "steps.0.failure: missing",
      ]);
    });

    it("refuses another kind, outcome, step number or status", () => {
      expect(problemsOf(null)).toEqual(["an answer is a JSON object"]);
      expect(
        problemsOf({
          kind: "reply",
          outcome: "done",
          steps: [{ step: 0, outcome: "x", status: 7 }],
        }),
      ).toEqual([
        "kind: not action-result",
        "outcome: not allowed",
        "steps.0.step: not a step number",
        "steps.0.outcome: not allowed",
        "steps.0.status: not an HTTP status",
      ]);
      expect(problemsOf({ ...succeeded, steps: "all" })).toEqual(["steps: not a list"]);
    });
  });

  it("fits an action item only with an action-result that passes the check", () => {
    expect(answerFitsItem(actionItem, succeeded)).toBe(true);
    expect(answerFitsItem(actionItem, { kind: "reply", text: "Done" })).toBe(false);
    expect(answerFitsItem(actionItem, { kind: "option", option: "yes" })).toBe(false);
    const withAccount = { ...succeeded, account: "acme-admin" } as ActionResultAnswer;
    expect(answerFitsItem(actionItem, withAccount)).toBe(false);
    expect(answerFitsItem(item, succeeded)).toBe(false);
    expect(answerFitsItem(item, { kind: "reply", text: "Not yet" })).toBe(true);
  });
});
