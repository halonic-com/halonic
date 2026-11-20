import type { StateType } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { type COMMON_STATE_KEYS, STATE_KEYS, type StateKey, typesUsing } from "./state-keys.ts";
import { workflowOf } from "./test/workflow.spec.ts";
import { validateWorkflow } from "./validate.ts";

/** The `ignored-key` warnings of a workflow that starts at `s` and ends at `end`, as `path: message`. */
function ignored(states: Record<string, unknown>): string[] {
  const workflow = workflowOf({
    id: "w",
    name: "W",
    initial: "s",
    states: { ...states, end: { type: "final" } },
  });
  return validateWorkflow(workflow)
    .filter((found) => found.code === "ignored-key")
    .map((found) => {
      expect(found.severity).toBe("warning");
      return `${found.path.join(".")}: ${found.message}`;
    });
}

verifies("workflow.validate-ignored-keys", () => {
  it("warns once per key a wait step ignores, and says where an agent goes", () => {
    const states = {
      s: { agent: "a", on: [{ to: "review" }] },
      review: { type: "wait", agent: "a", input: "Check it", on: [{ to: "end", event: "ok" }] },
    };
    expect(ignored(states)).toEqual([
      'states.review.agent: "review" is a wait step: agent is ignored. Put the agent on a task step before it.',
      'states.review.input: "review" is a wait step: input is ignored. Only task, workflow and for-each steps use it; remove it here.',
    ]);
  });

  it("warns about artifact and conversation on a wait step", () => {
    const states = {
      s: {
        type: "wait",
        artifact: { name: "notes" },
        conversation: "chat",
        on: [{ to: "end", event: "ok" }],
      },
    };
    expect(ignored(states)).toEqual([
      'states.s.conversation: "s" is a wait step: conversation is ignored. Only task steps use it; remove it here.',
      'states.s.artifact: "s" is a wait step: artifact is ignored. Only task steps use it; remove it here.',
    ]);
  });

  it("warns about items and concurrency on a task step", () => {
    const states = {
      s: { agent: "a", items: "{{context.list}}", concurrency: 2, on: [{ to: "end" }] },
    };
    expect(ignored(states)).toEqual([
      'states.s.items: "s" is a task step: items is ignored. Only for-each steps use it; remove it here.',
      'states.s.concurrency: "s" is a task step: concurrency is ignored. Only for-each steps use it; remove it here.',
    ]);
  });

  it("warns about with without a method, on a step and on a parallel branch", () => {
    const states = {
      s: { agent: "a", with: { to: "x" }, on: [{ to: "both" }] },
      both: {
        type: "parallel",
        branches: { one: { agent: "a", with: { to: "x" } }, two: { agent: "a" } },
        on: [{ to: "end" }],
      },
    };
    expect(ignored(states)).toEqual([
      'states.s.with: "s" has with but no method: with is ignored. Add the method it is for, or put the text in input.',
      'states.both.branches.one.with: Branch "one" of "both" has with but no method: with is ignored. Add the method it is for, or put the text in input.',
    ]);
  });

  it("warns about continueOnError with join: any", () => {
    const states = {
      s: {
        type: "parallel",
        join: "any",
        continueOnError: true,
        branches: { one: { agent: "a" } },
        on: [{ to: "end" }],
      },
    };
    expect(ignored(states)).toEqual([
      'states.s.continueOnError: "s" has join: any, so continueOnError is ignored. Remove it, or use join: all.',
    ]);
  });

  it("says nothing about steps that set only the keys their type uses", () => {
    const states = {
      s: { agent: "a", input: "Hi", output: "reply", on: [{ to: "wait" }] },
      wait: { type: "wait", description: "Check", on: [{ to: "sub", event: "ok" }] },
      sub: { type: "workflow", workflow: "other", output: "child", on: [{ to: "both" }] },
      both: {
        type: "parallel",
        join: "all",
        continueOnError: true,
        branches: { one: { agent: "a", method: "m", with: { x: 1 } } },
        on: [{ to: "each" }],
      },
      each: {
        type: "foreach",
        items: "{{context.list}}",
        agent: "a",
        concurrency: 2,
        on: [{ to: "end" }],
      },
    };
    expect(ignored(states)).toEqual([]);
  });

  it("gives every key a state can have to at least one type, and lists the types that use one", () => {
    type UsedKey = (typeof COMMON_STATE_KEYS)[number] | (typeof STATE_KEYS)[StateType][number];
    // A key added to the workflow schema fails typecheck here until a type uses it.
    expectTypeOf<Exclude<StateKey, UsedKey>>().toEqualTypeOf<never>();
    expect(typesUsing("with")).toEqual(["task", "foreach"]);
    expect(typesUsing("description")).toEqual(Object.keys(STATE_KEYS));
  });
});
