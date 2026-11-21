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

  it("checks a signal's data after its own step wrote its keys (C340 C10+)", () => {
    const replied = (text: string) =>
      supportReply({
        draft: {
          agent: "writer",
          output: "reply",
          signal: { name: "replied", data: { text } },
          on: [{ to: "review" }],
        },
      });
    expect(found(validateWorkflow(replied("{{context.reply}}")), "unknown-template-name")).toEqual(
      [],
    );
    expect(found(validateWorkflow(replied("{{context.rpely}}")), "unknown-template-name")).toEqual([
      {
        severity: "error",
        message:
          '"draft" uses {{context.rpely}}, but no earlier step writes context.rpely. Did you mean context.reply?',
        path: ["states", "draft", "signal", "data"],
      },
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

/** Acme's support reply with a for-each step `each` after `classify`, its keys given. */
function withForeach(each: Record<string, unknown>) {
  return supportReply({
    classify: { agent: "sorter", output: "kind", on: [{ to: "each" }] },
    each: {
      type: "foreach",
      items: "{{input.topics}}",
      agent: "writer",
      ...each,
      on: [{ to: "draft" }],
    },
  });
}

verifies("workflow.validate-item-names", () => {
  it("refuses {{item}} when the step names its items with as, and says which name to write", () => {
    const issues = validateWorkflow(withForeach({ as: "topic", input: "Announce {{item}}" }));
    expect(found(issues, "unknown-item-name")).toEqual([
      {
        severity: "error",
        message:
          '"each" uses {{item}}, but its items are named topic (as: topic). Write {{topic}}, or remove as: topic.',
        path: ["states", "each", "input"],
      },
    ]);
  });

  it("says which name is near for a misspelled item name in with", () => {
    const issues = validateWorkflow(withForeach({ as: "topic", with: { text: "{{topc}}" } }));
    expect(found(issues, "unknown-item-name")).toEqual([
      {
        severity: "error",
        message:
          '"each" uses {{topc}}, but each item is named topic; a for-each step can read {{topic}}, {{index}}, input and context. Did you mean {{topic}}?',
        path: ["states", "each", "with"],
      },
    ]);
  });

  it("accepts the item, its place, the run's input and the context", () => {
    const issues = validateWorkflow(
      withForeach({ input: "{{item.title}} ({{index}}) for {{input.team}}: {{context.kind}}" }),
    );
    expect(found(issues, "unknown-item-name")).toEqual([]);
    expect(found(issues, "unknown-template-name")).toEqual([]);
  });
});
