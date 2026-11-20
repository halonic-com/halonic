import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { workflowOf } from "./test/workflow.spec.ts";
import { validateWorkflow } from "./validate.ts";
import type { ValidateOptions, WorkflowIssue } from "./workflow-issue.ts";

/** Acme's support reply, cut down: `classify` writes `kind`, `draft` writes `reply`, `review` waits. */
function supportReply(states: Record<string, Record<string, unknown>> = {}) {
  const base: Record<string, Record<string, unknown>> = {
    classify: {
      agent: "sorter",
      output: "kind",
      on: [{ to: "ignored", when: { equals: ["{{context.kind}}", "spam"] } }, { to: "draft" }],
    },
    draft: {
      agent: "writer",
      input: "Answer: {{context.kind}}",
      output: "reply",
      on: [{ to: "review" }],
    },
    review: {
      type: "wait",
      description: "Approve this reply?\n{{context.reply}}",
      on: [{ to: "ignored", event: "approve" }],
    },
    ignored: { type: "final" },
  };
  return workflowOf({
    id: "support-reply",
    name: "Support reply",
    initial: "classify",
    states: { ...base, ...states },
  });
}

const sorter: ValidateOptions = { choices: { sorter: ["refund", "question", "spam"] } };

function found(issues: WorkflowIssue[], code: WorkflowIssue["code"]) {
  return issues
    .filter((issue) => issue.code === code)
    .map(({ message, path, severity }) => ({ severity, message, path }));
}

verifies("workflow.validate-template-names", () => {
  it("accepts names an earlier step or the step's own condition writes", () => {
    expect(found(validateWorkflow(supportReply(), sorter), "unknown-template-name")).toEqual([]);
  });

  it("refuses a misspelled name in a condition, and says which name is near", () => {
    const typo = supportReply({
      classify: {
        agent: "sorter",
        output: "kind",
        on: [{ to: "ignored", when: { equals: ["{{context.knd}}", "spam"] } }, { to: "draft" }],
      },
    });
    expect(found(validateWorkflow(typo), "unknown-template-name")).toEqual([
      {
        severity: "error",
        message:
          '"classify" uses {{context.knd}}, but no earlier step writes context.knd. Did you mean context.kind?',
        path: ["states", "classify", "on", 0, "when"],
      },
    ]);
  });

  it("refuses a misspelled name in a description, which would show an empty card", () => {
    const typo = supportReply({
      review: {
        type: "wait",
        description: "Approve this reply?\n{{context.replly}}",
        on: [{ to: "ignored", event: "approve" }],
      },
    });
    expect(found(validateWorkflow(typo), "unknown-template-name")).toEqual([
      {
        severity: "error",
        message:
          '"review" uses {{context.replly}}, but no earlier step writes context.replly. Did you mean context.reply?',
        path: ["states", "review", "description"],
      },
    ]);
  });

  it("lists the names there are when none is near, in an input, with, items or exists", () => {
    const far = supportReply({
      draft: {
        agent: "writer",
        input: { mail: "{{context.message.text}}" },
        with: { tone: "{{context.tone}}" },
        output: "reply",
        on: [{ to: "review", when: { not: { exists: "context.owner" } } }, { to: "review" }],
      },
    });
    expect(
      found(validateWorkflow(far), "unknown-template-name").map((issue) => issue.message),
    ).toEqual([
      '"draft" uses {{context.message}}, but no earlier step writes context.message. Use one an earlier step writes: context.kind.',
      '"draft" uses {{context.tone}}, but no earlier step writes context.tone. Use one an earlier step writes: context.kind.',
      '"draft" uses {{context.owner}}, but no earlier step writes context.owner. Use one an earlier step writes: context.kind, context.reply.',
    ]);
  });

  it("says to write a name first when no earlier step writes any, and leaves input names alone", () => {
    const first = supportReply({
      classify: {
        agent: "sorter",
        input: "{{input.mail}} {{context.mail}}",
        output: "kind",
        on: [{ to: "draft" }],
      },
    });
    expect(
      found(validateWorkflow(first), "unknown-template-name").map((issue) => issue.message),
    ).toEqual([
      '"classify" uses {{context.mail}}, but no earlier step writes context.mail. Write it in an earlier step first, with output.',
    ]);
  });
});

verifies("workflow.validate-choice-values", () => {
  it("warns when a condition compares a choice with a value that isn't one of its options", () => {
    const junk = supportReply({
      classify: {
        agent: "sorter",
        output: "kind",
        on: [{ to: "ignored", when: { equals: ["{{context.kind}}", "junk"] } }, { to: "draft" }],
      },
    });
    expect(found(validateWorkflow(junk, sorter), "not-a-choice")).toEqual([
      {
        severity: "warning",
        message:
          '"classify" compares context.kind with "junk", but the agent sorter only answers refund, question or spam. Use one of those, or add "junk" to the options of sorter.',
        path: ["states", "classify", "on", 0, "when"],
      },
    ]);
  });

  it("finds the comparison either way round, inside any, and on a later step", () => {
    const later = supportReply({
      draft: {
        agent: "writer",
        output: "reply",
        on: [
          { to: "review", when: { any: [{ notEquals: ["Spam", "{{context.kind}}"] }] } },
          { to: "review" },
        ],
      },
    });
    expect(
      found(validateWorkflow(later, sorter), "not-a-choice").map((issue) => issue.path),
    ).toEqual([["states", "draft", "on", 0, "when"]]);
  });

  it("checks nothing without the agents' options, or when the step's reply isn't the agent's choice", () => {
    const junk = { equals: ["{{context.kind}}", "junk"] };
    const plain = supportReply({
      classify: {
        agent: "sorter",
        output: "kind",
        on: [{ to: "ignored", when: junk }, { to: "draft" }],
      },
    });
    expect(found(validateWorkflow(plain), "not-a-choice")).toEqual([]);
    for (const own of [{ format: "json" }, { method: "sort" }]) {
      const notChoice = supportReply({
        classify: {
          agent: "sorter",
          ...own,
          output: "kind",
          on: [{ to: "ignored", when: junk }, { to: "draft" }],
        },
      });
      expect(found(validateWorkflow(notChoice, sorter), "not-a-choice")).toEqual([]);
    }
  });
});
