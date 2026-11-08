import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

const workflow = (...states: string[]) =>
  yaml("id: invoice", "name: Invoice", "initial: start", "states:", ...states);

verifies("format.workflow-file", () => {
  it("fills in context, layout, the state type, its transitions and their event", () => {
    const value = parsedValue(
      "workflow",
      workflow(
        "  start:",
        "    agent: clerk",
        "    on: [{ to: done }]",
        "  done:",
        "    type: final",
      ),
    );
    expect(value.context).toEqual({});
    expect(value.layout).toEqual({});
    expect(value.states["start"]).toEqual({
      type: "task",
      agent: "clerk",
      on: [{ to: "done", event: "done" }],
    });
    expect(value.states["done"]).toEqual({ type: "final", on: [] });
  });

  it("fills in a signal's data and an artifact's media type", () => {
    const value = parsedValue(
      "workflow",
      workflow("  start:", "    signal: { name: mail.tagged }", "    artifact: { name: summary }"),
    );
    expect(value.states["start"]?.signal).toEqual({ name: "mail.tagged", data: {} });
    expect(value.states["start"]?.artifact).toEqual({
      name: "summary",
      mediaType: "text/markdown",
    });
  });

  it("accepts nested guards on a transition", () => {
    const value = parsedValue(
      "workflow",
      workflow(
        "  start:",
        "    on:",
        "      - to: done",
        "        when: { all: [{ exists: context.total }, { not: { lt: ['{{context.total}}', 10] } }] }",
      ),
    );
    expect(value.states["start"]?.on[0]?.when).toEqual({
      all: [{ exists: "context.total" }, { not: { lt: ["{{context.total}}", 10] } }],
    });
  });

  it("refuses a guard that isn't one of the known shapes, at the guard", () => {
    const text = workflow(
      "  start:",
      "    on:",
      "      - to: done",
      "        when: { between: [1, 2] }",
    );
    expect(summary(problemsOf("workflow", text))).toEqual([
      "states.start.on.0.when invalid_union 8",
    ]);
  });

  it("refuses a timer without a unit and gets outside input and context", () => {
    const text = workflow(
      "  start:",
      "    gets: [input.message, run.id]",
      "    on: [{ to: done, after: 30 }, { to: done, after: '0m' }]",
    );
    expect(summary(problemsOf("workflow", text))).toEqual([
      "states.start.gets.1 invalid_format 6",
      "states.start.on.0.after invalid_type 7",
      "states.start.on.1.after invalid_format 7",
    ]);
  });

  it("refuses more than 16 items at once and an unknown join", () => {
    const text = workflow("  each:", "    type: foreach", "    concurrency: 17", "    join: some");
    expect(summary(problemsOf("workflow", text))).toEqual([
      "states.each.concurrency too_big 7",
      "states.each.join invalid_value 8",
    ]);
  });

  it("refuses an unknown key in a branch, at the branch", () => {
    const text = workflow(
      "  checks:",
      "    type: parallel",
      "    branches:",
      "      vendor: { agent: clerk, prompt: hi }",
    );
    expect(summary(problemsOf("workflow", text))).toEqual([
      "states.checks.branches.vendor unrecognized_keys 8",
    ]);
  });

  it("refuses a workflow without an initial state", () => {
    const text = yaml("id: invoice", "name: Invoice", "states: {}");
    expect(summary(problemsOf("workflow", text))).toEqual(["initial invalid_type 1"]);
  });
});
