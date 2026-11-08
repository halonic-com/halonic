import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { childInput, contextBefore, promptFor, withGets } from "./inputs.ts";
import { mailWorkflow } from "./test/mail-workflow.spec.ts";
import { workflowOf } from "./test/workflow.spec.ts";

verifies("workflow.context-before", () => {
  // Ported from "picked data (gets)" › "knows which context keys exist before each step" at 784f78d.
  it("knows which context keys exist before each step", () => {
    expect(contextBefore(mailWorkflow, "tag")).toEqual(["owner"]);
    expect(contextBefore(mailWorkflow, "check")).toEqual(["owner", "tags"]);
    expect(contextBefore(mailWorkflow, "reply")).toEqual(["check", "owner", "tags"]);
  });

  // New.
  it("follows loops back, so a state on a loop sees its own output", () => {
    const loop = workflowOf({
      id: "loop",
      name: "Loop",
      initial: "draft",
      states: {
        draft: { agent: "a", output: "draft", on: [{ to: "review" }] },
        review: {
          type: "wait",
          on: [
            { to: "draft", event: "reject" },
            { to: "end", event: "approve" },
          ],
        },
        end: { type: "final" },
      },
    });
    expect(contextBefore(loop, "draft")).toEqual(["draft"]);
    expect(contextBefore(loop, "end")).toEqual(["draft"]);
  });
});

verifies("workflow.with-gets", () => {
  // Ported from "picked data (gets)" › "adds the picked values after the prompt, text as is and
  // the rest as JSON" at 784f78d.
  it("adds the picked values after the prompt, text as is and the rest as JSON", () => {
    const scope = { input: { message: "Hi there" }, context: { tags: ["school"] } };
    expect(
      withGets("Check this mail.", ["input.message", "context.tags", "context.missing"], scope),
    ).toBe(
      'Check this mail.\n\n## Data\n\n### input.message\nHi there\n\n### context.tags\n[\n  "school"\n]\n\n### context.missing\n(not set)',
    );
    expect(withGets("Same", undefined, scope)).toBe("Same");
  });

  // New.
  it("leaves the prompt as it is for an empty list, and writes null as JSON", () => {
    expect(withGets("  Same  ", [], {})).toBe("  Same  ");
    expect(withGets("Go.\n", ["context.none"], { context: { none: null } })).toBe(
      "Go.\n\n## Data\n\n### context.none\nnull",
    );
  });
});

verifies("workflow.state-input", () => {
  // New: the old repo tested promptFor and childInput only through its engine.
  const scope = { input: { from: "support", n: 3 }, context: { tags: ["a"] } };

  it("renders an agent's prompt text, writes a map as JSON, and sends the run input without one", () => {
    expect(promptFor("Reply to {{input.from}}", scope, {})).toBe("Reply to support");
    expect(promptFor({ count: "{{input.n}}", tags: "{{context.tags}}" }, scope, {})).toBe(
      '{"count":3,"tags":["a"]}',
    );
    expect(promptFor(undefined, scope, { n: 3 })).toBe('{"n":3}');
  });

  it("gives a child run a rendered map, a text as its message, or nothing", () => {
    expect(childInput({ count: "{{input.n}}", note: "for {{input.from}}" }, scope)).toEqual({
      count: 3,
      note: "for support",
    });
    expect(childInput("Count {{input.n}}", scope)).toEqual({ message: "Count 3" });
    expect(childInput(undefined, scope)).toEqual({});
  });
});
