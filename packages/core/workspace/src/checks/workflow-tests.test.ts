import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

/** A small Acme support hub: a writer, a sorter that answers with a choice, and a spam branch. */
const hub = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/support/hub.yaml": "name: Support\n",
  "hubs/support/agents/writer.agent.yaml": "name: Writer\n",
  "hubs/support/agents/sorter.agent.yaml":
    "name: Sorter\noutput:\n  type: choice\n  options: [refund, question, spam]\n",
  "hubs/support/workflows/support-reply.workflow.yaml": [
    "name: Support reply",
    "initial: read",
    "states:",
    "  read:",
    "    agent: writer",
    "    on: [{ to: classify }]",
    "  classify:",
    "    agent: sorter",
    "    output: kind",
    "    on:",
    '      - { to: ignored, when: { equals: ["{{context.kind}}", spam] } }',
    "      - to: replied",
    "  replied: { type: final }",
    "  ignored: { type: final }",
    "",
  ].join("\n"),
};

const testFile = "hubs/support/workflows/support-reply.test.yaml";

/** The test file with one case: its mocks and its expect, each one line of YAML. */
function testWith(mocks: string, expect = "{ final: ignored }"): string {
  return [
    "workflow: support-reply",
    "cases:",
    "  - name: Spam is ignored",
    "    mocks:",
    `      ${mocks}`,
    `    expect: ${expect}`,
    "",
  ].join("\n");
}

/** The check issues of the test file: severity, code, line and message. */
async function issuesOf(files: Record<string, string>) {
  const workspace = await loadWorkspace(new MemorySource({ ...hub, ...files }));
  return workspace.issues
    .filter((issue) => issue.file === testFile)
    .map(({ severity, code, line, message }) => ({ severity, code, line, message }));
}

verifies("workspace.test-references", () => {
  it("gives no issue for a test that names only what the workflow has", async () => {
    const files = { [testFile]: testWith("{ writer: [A prize.], sorter: [spam], '*': [x] }") };
    expect(await issuesOf(files)).toEqual([]);
  });

  it("gives an error, with Did you mean, for a mocked agent the workflow doesn't use", async () => {
    const files = { [testFile]: testWith("{ writer: [A prize.], soter: [spam] }") };
    expect(await issuesOf(files)).toEqual([
      {
        severity: "error",
        code: "unknown-mock-agent",
        line: 5,
        message:
          "The test mocks the agent soter, which the workflow doesn't use. Did you mean sorter?",
      },
    ]);
  });

  it("lists the agents the workflow uses when no name is near", async () => {
    const files = { [testFile]: testWith("{ archivist: [Filed.] }") };
    expect((await issuesOf(files)).map((issue) => issue.message)).toEqual([
      "The test mocks the agent archivist, which the workflow doesn't use. Mock only the agents it uses: writer and sorter.",
    ]);
  });

  it("gives a warning for a mocked reply that isn't one of a choice agent's options", async () => {
    const files = { [testFile]: testWith("{ writer: [A prize.], sorter: [questions] }") };
    expect(await issuesOf(files)).toEqual([
      {
        severity: "warning",
        code: "mock-not-an-option",
        line: 5,
        message:
          "The mocked reply \"questions\" isn't one of sorter's options, so the run fails at that step. Use refund, question or spam.",
      },
    ]);
  });

  it("gives an error, with Did you mean, for expect.final and expect.states steps the workflow doesn't have", async () => {
    const files = {
      [testFile]: testWith(
        "{ writer: [A prize.], sorter: [spam] }",
        "{ final: ignore, states: [read, clasify, ignored] }",
      ),
    };
    expect(await issuesOf(files)).toEqual([
      {
        severity: "error",
        code: "unknown-expected-step",
        line: 6,
        message:
          'expect.final is "ignore", but the workflow has no step ignore. Did you mean ignored?',
      },
      {
        severity: "error",
        code: "unknown-expected-step",
        line: 6,
        message:
          'expect.states names "clasify", but the workflow has no step clasify. Did you mean classify?',
      },
    ]);
  });

  it("lists the workflow's steps when no step is near", async () => {
    const files = { [testFile]: testWith("{ sorter: [spam] }", "{ final: archived }") };
    expect((await issuesOf(files)).map((issue) => issue.message)).toEqual([
      'expect.final is "archived", but the workflow has no step archived. Its steps are read, classify, replied and ignored.',
    ]);
  });

  describe("what the workflow's runs reach", () => {
    it("counts the agents of a workflow it runs and their subagents", async () => {
      const files = {
        "hubs/support/agents/writer.agent.yaml": "name: Writer\nsubagents: [checker]\n",
        "hubs/support/agents/checker.agent.yaml": "name: Checker\n",
        "hubs/support/workflows/outer.workflow.yaml": [
          "name: Outer",
          "initial: inner",
          "states:",
          "  inner: { type: workflow, workflow: support-reply, on: [{ to: done }] }",
          "  done: { type: final }",
          "",
        ].join("\n"),
        "hubs/support/workflows/outer.test.yaml": [
          "workflow: outer",
          "cases:",
          "  - name: Runs the reply",
          "    mocks: { writer: [A prize.], checker: [Fine.], sorter: [spam] }",
          "",
        ].join("\n"),
      };
      const workspace = await loadWorkspace(new MemorySource({ ...hub, ...files }));
      expect(workspace.issues).toEqual([]);
    });

    it("doesn't check a reply of a choice agent that a method or a format calls", async () => {
      const files = {
        "hubs/support/workflows/support-reply.workflow.yaml": hub[
          "hubs/support/workflows/support-reply.workflow.yaml"
        ].replace("    output: kind\n", "    output: kind\n    format: text\n"),
        [testFile]: testWith("{ writer: [A prize.], sorter: [Anything at all.] }", "{}"),
      };
      const workspace = await loadWorkspace(new MemorySource({ ...hub, ...files }));
      expect(workspace.issues).toEqual([]);
    });
  });
});
