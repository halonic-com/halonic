import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { inputReads, readsWholeInput } from "./input-checks.ts";
import { workflowOf } from "./test/workflow.spec.ts";
import { validateWorkflow } from "./validate.ts";
import type { ValidateOptions } from "./workflow-issue.ts";

/** Support reply as Acme has it: the start form writes `mail`, and two steps read it. */
const supportReply = (
  read: Record<string, unknown>,
  start: Record<string, unknown> | null = { label: "Answer an email", field: "mail" },
) =>
  workflowOf({
    id: "support-reply",
    name: "Support reply",
    initial: "read",
    ...(start === null ? {} : { start }),
    states: {
      read: { agent: "writer", output: "request", on: [{ to: "draft" }], ...read },
      draft: { agent: "writer", gets: ["input.mail", "context.request"], on: [{ to: "done" }] },
      done: { type: "final" },
    },
  });

const inputIssues = (workflow: ReturnType<typeof workflowOf>, options: ValidateOptions = {}) =>
  validateWorkflow(workflow, options)
    .filter((found) =>
      ["unknown-gets", "unknown-template-name", "unread-start-field"].includes(found.code),
    )
    .map(({ code, message, path }) => ({ code, message, path }));

verifies("workflow.validate-input", () => {
  it("reports a gets of an input field the workflow's input doesn't have, with the near one", () => {
    expect(inputIssues(supportReply({ gets: ["input.email"] }))).toEqual([
      {
        code: "unknown-gets",
        message:
          '"read" gets input.email, but the workflow\'s input has no field email. Did you mean input.mail?',
        path: ["states", "read", "gets", 0],
      },
    ]);
  });

  it("reports an {{input.<name>}} in a step's text at the text", () => {
    expect(inputIssues(supportReply({ input: "Summarise {{ input.mial.body }}" }))).toEqual([
      {
        code: "unknown-template-name",
        message:
          '"read" uses {{input.mial.body}}, but the workflow\'s input has no field mial. Did you mean input.mail?',
        path: ["states", "read", "input"],
      },
    ]);
  });

  it("lists the input's fields when none is near, with the tests' fields as given", () => {
    const options = { inputFields: ["mail", "from"] };
    expect(inputIssues(supportReply({ gets: ["input.order"] }), options)).toEqual([
      {
        code: "unknown-gets",
        message:
          '"read" gets input.order, but the workflow\'s input has no field order. It has only mail and from: read one of those, or add order to the input you start the workflow with.',
        path: ["states", "read", "gets", 0],
      },
    ]);
    expect(inputIssues(supportReply({ gets: ["input.from"] }), options)).toEqual([]);
  });

  it("names a single field as the only one, whether it comes from tests or not", () => {
    expect(inputIssues(supportReply({ gets: ["input.order"] }), { inputFields: ["mail"] })).toEqual(
      [
        {
          code: "unknown-gets",
          message:
            '"read" gets input.order, but the workflow\'s input has no field order. Its only field is mail: read that, or add order to the input you start the workflow with.',
          path: ["states", "read", "gets", 0],
        },
      ],
    );
  });

  it("reports a start.field no step reads once, not each step that reads another field", () => {
    const start = { label: "Answer an email", field: "email" };
    expect(inputIssues(supportReply({ gets: ["input.mail"] }, start))).toEqual([
      {
        code: "unread-start-field",
        message:
          "start.field is email, but no step reads input.email. The steps read input.mail: use that name as field, or add input.email to a step's gets.",
        path: ["start", "field"],
      },
    ]);
  });

  it("asks for a gets when no step reads any input field", () => {
    const quiet = workflowOf({
      id: "w",
      name: "W",
      initial: "s",
      start: { label: "Ask", field: "question" },
      states: { s: { agent: "a", input: "Hello", on: [{ to: "end" }] }, end: { type: "final" } },
    });
    expect(inputIssues(quiet).map((found) => found.message)).toEqual([
      "start.field is question, but no step reads input.question. Add input.question to the gets of the step that needs it.",
    ]);
  });

  it("checks nothing when a step sends its agent the whole input, or nothing names the input", () => {
    const whole = supportReply({ gets: undefined, input: undefined });
    expect(readsWholeInput(whole.states["read"] ?? { type: "final", on: [] })).toBe(true);
    expect(inputIssues(whole)).toEqual([]);
    expect(inputIssues(supportReply({ input: "All of it: {{input}}" }, null))).toEqual([]);
    expect(inputIssues(supportReply({ gets: ["input.email"] }, null))).toEqual([]);
  });

  it("finds the fields a step reads in gets, prompts, conditions and branches", () => {
    const state = workflowOf({
      id: "w",
      name: "W",
      initial: "s",
      states: {
        s: {
          type: "parallel",
          gets: ["input.a.deep", "context.c"],
          branches: { one: { agent: "x", input: "{{input.b}} and {{context.d}}" } },
          on: [{ to: "end", when: { equals: ["{{input.c}}", "yes"] } }],
        },
        end: { type: "final" },
      },
    }).states["s"];
    expect(inputReads("s", state ?? { type: "final", on: [] }).map((read) => read.field)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
