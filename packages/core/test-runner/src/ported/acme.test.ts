// The old runner's acme suite, through `runWorkspaceTests`: the repository's
// example workspace passes its own tests, a broken case says what it
// expected, and agents delegate, call scripted tools and wait for approvals.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { beforeAll, describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { fakeDeps, promptsOf, recordingDeps } from "../test/fakes.ts";
import { MemorySource } from "../test/memory-source.ts";
import { agent, testFile, testInput, workflow } from "../test/workspaces.ts";
import type { TestInput } from "../test-deps.ts";

/** The repository's example workspace, as the docs and `halonic init --example acme` use it. */
const acmeFolder = join(import.meta.dirname, "..", "..", "..", "..", "..", "examples", "acme");

/** The example's files, read from disk into memory, with the test file the test gives. */
async function acme(testText?: string): Promise<TestInput> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(acmeFolder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[path.slice(acmeFolder.length + 1).replaceAll("\\", "/")] = readFileSync(path, "utf8");
  }
  if (testText !== undefined) files["hubs/support/workflows/support-reply.test.yaml"] = testText;
  const source = new MemorySource(files);
  return { workspace: await loadWorkspace(source), textOf: (path) => source.read(path) };
}

const tracker = {
  "library/connectors/tracker.connector.yaml": `id: tracker
name: Tracker
transport: { http: { url: "http://localhost:7777/mcp" } }
tools: { allow: [search_issues, create_issue], approve: [create_issue] }
`,
};

const fileIt = workflow(
  "file-it",
  `id: file-it
name: File it
initial: s
states:
  s: { type: task, agent: clerk, input: "{{input.q}}", output: answer, on: [{ to: end }] }
  end: { type: final }
`,
);

verifies("test-runner.old-suites", () => {
  describe("the example workspace", () => {
    // Loading the example takes seconds under a full verify, as in the workspace package.
    const loadLimitMs = 60_000;
    let example: TestInput;
    beforeAll(async () => {
      example = await acme();
    }, loadLimitMs);

    it("passes every workflow test", async () => {
      const suite = await runWorkspaceTests(example, fakeDeps());

      expect(suite).toMatchObject({ passed: 5, failed: 0 });
      expect(suite.tests.map((test) => [test.workflow, test.line])).toEqual([
        ["support-reply", 3],
        ["support-reply", 18],
        ["support-reply", 32],
        ["support-reply", 44],
        ["support-reply", 57],
      ]);
    });

    it("reports a failing expectation with both lists of steps", async () => {
      const broken = await acme(`workflow: support-reply
cases:
  - name: wrong
    input: { mail: x }
    mocks: { writer: [A request.], sorter: [spam] }
    expect: { states: [read, classify, draft] }
`);

      const [test] = (await runWorkspaceTests(broken, fakeDeps())).tests;

      expect(test).toMatchObject({ passed: false, line: 3 });
      expect(test?.failures).toEqual([
        {
          kind: "states",
          expected: ["read", "classify", "draft"],
          actual: ["read", "classify", "ignored"],
        },
      ]);
    });
  });

  describe("agents in tests", () => {
    it("hand tasks down to subagents with delegate_<id> tools, and no connector they don't list", async () => {
      const input = await testInput(
        tracker,
        agent("lead", "subagents: [writer]\n"),
        agent("writer", "description: Writes replies\nsubagents: [editor]\n"),
        agent("editor"),
        workflow(
          "reply",
          "id: reply\nname: Reply\ninitial: s\nstates:\n  s: { type: task, agent: lead, input: Answer, output: answer, on: [{ to: end }] }\n  end: { type: final }\n",
        ),
        testFile(
          "reply",
          `workflow: reply
cases:
  - name: delegates
    mocks: { lead: ['tool:delegate_writer {"task": "Draft a reply"}', Sent], writer: ['tool:delegate_editor {"task": "Polish"}', Draft v2], editor: [Polished] }
    expect: { final: end, context: { answer: Sent } }
`,
        ),
      );
      const { deps, models } = recordingDeps();

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      // The run log doesn't hold a subagent's turn yet, so the prompts show the delegation.
      expect(promptsOf(models[0])).toEqual([
        ["lead", "Answer"],
        ["writer", "Draft a reply"],
        ["editor", "Polish"],
        ["writer", "Polished"],
        ["lead", "Draft v2"],
      ]);
      // The workspace has a tracker, but none of these agents lists it.
      const offered = (models[0]?.requests ?? []).flatMap((request) =>
        (request.tools ?? []).map((tool) => tool.name),
      );
      expect(offered).toContain("delegate_writer");
      expect(offered).not.toContain("search_issues");
      expect(offered).not.toContain("create_issue");
    });

    it("script tool results, offline", async () => {
      const input = await testInput(
        tracker,
        agent("clerk", "connectors: [tracker]\n"),
        fileIt,
        testFile(
          "file-it",
          `workflow: file-it
cases:
  - name: searches the tracker
    input: { q: login }
    mocks: { clerk: ['tool:search_issues {"q": "login"}', done] }
    tools: { tracker.search_issues: ['[#12 Login fails]'] }
    expect: { final: end, context: { answer: done } }
`,
        ),
      );
      const { deps, models } = recordingDeps();

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      expect(promptsOf(models[0])[1]).toEqual(["clerk", "[#12 Login fails]"]);
    });

    it("wait for a person before a tool that needs approval, then run it or tell the agent no", async () => {
      const decided = (decision: string, results: string) => `  - name: ${decision}
    input: { q: file it }
    mocks: { clerk: ['tool:create_issue {"title": "Login fails"}', Answered.] }
    events: [${decision}]
    tools: { ${results} }
    expect: { final: end, context: { answer: Answered. } }
`;
      const input = await testInput(
        tracker,
        agent("clerk", "connectors: [tracker]\n"),
        fileIt,
        testFile(
          "file-it",
          `workflow: file-it\ncases:\n${decided("approve", "tracker.create_issue: ['Created #13']")}${decided("reject", "")}`,
        ),
      );

      const { deps, models } = recordingDeps();

      const [approved, rejected] = (await runWorkspaceTests(input, deps)).tests;

      expect(approved?.failures).toEqual([]);
      expect(rejected?.failures).toEqual([]);
      const kinds = (events: readonly { type: string }[] = []) =>
        events
          .map((event) => event.type)
          .filter((type) => /^(approval|tool)\.|^run\.waiting$/.test(type));
      expect(kinds(approved?.runs[0]?.events)).toEqual([
        "approval.requested",
        "run.waiting",
        "approval.resolved",
        "tool.called",
        "tool.result",
      ]);
      expect(kinds(rejected?.runs[0]?.events)).toEqual([
        "approval.requested",
        "run.waiting",
        "approval.resolved",
      ]);
      expect(promptsOf(models[1])[1]).toEqual(["clerk", "Refused: a person rejected the call"]);
    });
  });
});
