import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import { checkActionEvent, isActionKeptName, maxActionErrorLength } from "./action-event-check.ts";
import type { ActionEvent, ActionEventType } from "./action-events.ts";

const at = "2026-11-24T13:00:00.000Z";

/** One valid event of each kind, with invented `acme` data. */
const valid: readonly ActionEvent[] = [
  {
    type: "action.requested",
    request: "req-1",
    at,
    definition: "github.approve-run",
    version: 1,
    parameters: { owner: "acme", repo: "app", runId: 123456 },
    requester: { kind: "agent", agent: "release-bot", run: "run-7" },
    reason: "The release run waits for a reviewer.",
    expires: "2026-11-25T13:00:00.000Z",
    expect: { headSha: "abc1234" },
  },
  { type: "action.reviewed", request: "req-1", at, decision: "opened", digest: "sha256-0f3a" },
  { type: "action.signed-in", request: "req-1", at, service: "github", account: "acme-dev" },
  { type: "action.step.started", request: "req-1", at, step: 1 },
  {
    type: "action.step.succeeded",
    request: "req-1",
    at,
    step: 1,
    status: 201,
    kept: { id: 42, state: "approved", note: null },
  },
  {
    type: "action.step.failed",
    request: "req-1",
    at,
    step: 2,
    failure: "service-error",
    status: 403,
    error: "Resource not accessible by integration",
  },
  { type: "action.step.skipped", request: "req-1", at, step: 2 },
  { type: "action.finished", request: "req-1", at, outcome: "failed" },
];

const problemsOf = (value: unknown): readonly string[] => {
  const result = checkActionEvent(value);
  return result.ok ? [] : result.problems;
};

verifies("events.action-events", () => {
  typeTest("has exactly the eight action event kinds", () => {
    expectTypeOf<ActionEventType>().toEqualTypeOf<
      | "action.requested"
      | "action.reviewed"
      | "action.signed-in"
      | "action.step.started"
      | "action.step.succeeded"
      | "action.step.failed"
      | "action.step.skipped"
      | "action.finished"
    >();
  });

  it("takes one valid event of each kind", () => {
    expect(new Set(valid.map((event) => event.type)).size).toBe(8);
    for (const event of valid) expect(checkActionEvent(event)).toEqual({ ok: true, event });
  });

  it("takes a step the user did on the page or by hand, which has no HTTP status", () => {
    const byHand = { type: "action.step.succeeded", request: "req-1", at, step: 1, kept: {} };
    expect(checkActionEvent(byHand)).toEqual({ ok: true, event: byHand });
  });

  describe("refuses every field outside its kind's allow-list", () => {
    const smuggled = ["authorization", "token", "headers", "input", "body", "answer", "cookie"];
    for (const event of valid) {
      it(`on ${event.type}`, () => {
        for (const field of smuggled) {
          expect(problemsOf({ ...event, [field]: "x" })).toEqual([`${field}: not allowed`]);
        }
      });
    }
  });

  it("refuses a field that belongs to another kind", () => {
    expect(problemsOf({ ...valid[3], kept: {} })).toEqual(["kept: not allowed"]);
  });

  it("refuses an object, a list or a long text hidden in parameters or kept fields", () => {
    const requested = valid[0];
    const succeeded = valid[4];
    expect(problemsOf({ ...requested, parameters: { headers: { authorization: "x" } } })).toEqual([
      "parameters: headers isn't a plain value",
    ]);
    expect(problemsOf({ ...succeeded, kept: { body: ["a", "b"] } })).toEqual([
      "kept: body isn't a plain value",
    ]);
    expect(problemsOf({ ...succeeded, kept: { body: "x".repeat(1001) } })).toEqual([
      "kept: body isn't a plain value",
    ]);
    expect(problemsOf({ ...succeeded, kept: { "x-header": "a" } })).toEqual([
      "kept: a field name that isn't plain",
    ]);
  });

  it("takes a kept name of up to 3 dotted keys, never in parameters or into a list", () => {
    const succeeded = valid[4];
    const kept = { "triggering_actor.login": "acme-dev", "head_commit.author.name": "Acme" };
    expect(problemsOf({ ...succeeded, kept })).toEqual([]);
    for (const name of ["a.b.c.d", "pull_requests.0", "pull_requests[0]", "a..b", "a."]) {
      expect(isActionKeptName(name)).toBe(false);
      expect(problemsOf({ ...succeeded, kept: { [name]: 1 } })).toEqual([
        "kept: a field name that isn't plain",
      ]);
    }
    expect(problemsOf({ ...valid[0], parameters: { "repo.owner": "acme" } })).toEqual([
      "parameters: a field name that isn't plain",
    ]);
  });

  it("refuses a requester with a field its kind doesn't have", () => {
    const requested = valid[0];
    const requester = { kind: "user", token: "x" };
    expect(problemsOf({ ...requested, requester })).toEqual([
      "requester: a field not allowed for user",
    ]);
    expect(problemsOf({ ...requested, requester: { kind: "toString" } })).toEqual([
      "requester: not a kind of requester",
    ]);
  });

  it("refuses an error message longer than the cap", () => {
    const failed = { ...valid[5], error: "x".repeat(maxActionErrorLength + 1) };
    expect(problemsOf(failed)).toEqual([`error: longer than ${maxActionErrorLength}`]);
  });

  it("refuses a missing field, a wrong value and an unknown kind, naming the field only", () => {
    const { step: _step, ...withoutStep } = valid[3] as Extract<ActionEvent, { step: number }>;
    expect(problemsOf(withoutStep)).toEqual(["step: missing"]);
    expect(problemsOf({ ...valid[7], outcome: "ran-anyway" })).toEqual(["outcome: not allowed"]);
    expect(problemsOf({ ...valid[3], at: "yesterday" })).toEqual(["at: not a UTC time"]);
    expect(problemsOf({ ...valid[3], request: "req\n1" })).toEqual([
      "request: has a control character",
    ]);
    expect(problemsOf({ ...valid[3], step: 0 })).toEqual(["step: not between 1 and 100"]);
    expect(problemsOf({ type: "action.sent", request: "req-1" })).toEqual([
      "type: not an action event",
    ]);
    expect(problemsOf(["action.finished"])).toEqual(["an action event is a JSON object"]);
  });

  it("refuses a key that is an own __proto__ from parsed JSON", () => {
    const parsed: unknown = JSON.parse(
      '{"type":"action.step.skipped","request":"req-1","at":"2026-11-24T13:00:00Z","step":1,"__proto__":{"token":"x"}}',
    );
    expect(problemsOf(parsed)).toEqual(["__proto__: not allowed"]);
  });
});
