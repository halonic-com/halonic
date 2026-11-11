import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "./run-tests.ts";
import { fakeDeps } from "./test/fakes.ts";
import { agent, testFile, testInput, workflow } from "./test/workspaces.ts";

/** The coder fixes it in its program, then the case's expectations follow. */
const fixWorkflow = workflow(
  "fix",
  `id: fix
name: Fix
initial: code
states:
  code: { type: task, agent: coder, input: "Fix it", output: fix, on: [{ to: done }] }
  done: { type: final }
`,
);

/** One checker program per repo, in item order. */
const checkWorkflow = workflow(
  "check",
  `id: check
name: Check
initial: each
states:
  each:
    type: foreach
    items: "{{input.repos}}"
    as: repo
    agent: checker
    input: "Check {{repo}}"
    output: checks
    on: [{ to: done }]
  done: { type: final }
`,
);

/** The `fix` test file with one case, whose body the test gives. */
function fixCase(body: string) {
  return testFile("fix", `workflow: fix\ncases:\n  - name: fixes\n${body}`);
}

/** The one case's failures and its run's error, run on the fixture's files. */
async function failuresOf(...parts: Record<string, string>[]) {
  const [test] = (await runWorkspaceTests(await testInput(...parts), fakeDeps())).tests;
  return { failures: test?.failures, error: test?.runs[0]?.summary.error };
}

verifies("test-runner.scripted-programs", () => {
  describe("scripted programs", () => {
    it("finishes a program with a text result, as a model reply would", async () => {
      const ran = await failuresOf(
        agent("coder", "harness: codex\n"),
        fixWorkflow,
        fixCase(`    programs: { coder: ["Fixed it."] }
    expect: { final: done, context: { fix: Fixed it. } }
`),
      );

      expect(ran.failures).toEqual([]);
    });

    it("finishes a program with any output value, in the claude-code harness too", async () => {
      const ran = await failuresOf(
        agent("coder", "harness: claude-code\n"),
        fixWorkflow,
        fixCase(`    programs: { coder: [{ output: { files: 3, passed: true } }] }
    expect: { final: done, context: { fix: { files: 3, passed: true } } }
`),
      );

      expect(ran.failures).toEqual([]);
    });

    it("fails the run with the message of a failing result", async () => {
      const expected = await failuresOf(
        agent("coder", "harness: codex\n"),
        fixWorkflow,
        fixCase(`    programs: { coder: [{ fails: "codex exited with code 1" }] }
    expect: { status: failed }
`),
      );
      const unexpected = await failuresOf(
        agent("coder", "harness: codex\n"),
        fixWorkflow,
        fixCase(`    programs: { coder: [{ fails: "codex exited with code 1" }] }
    expect: { final: done }
`),
      );

      expect(expected.failures).toEqual([]);
      expect(expected.error).toBe("codex exited with code 1");
      expect(unexpected.failures).toEqual([
        { kind: "status", expected: "completed", actual: "failed", step: "code" },
      ]);
    });

    it("gives a foreach's items the agent's results in item order", async () => {
      const [test] = (
        await runWorkspaceTests(
          await testInput(
            agent("checker", "harness: codex\n"),
            checkWorkflow,
            testFile(
              "check",
              `workflow: check
cases:
  - name: checks each repo
    input: { repos: [api, web] }
    programs:
      checker:
        - { output: { repo: api, ok: true } }
        - { output: { repo: web, ok: false } }
    expect:
      final: done
      context: { checks: [{ repo: api, ok: true }, { repo: web, ok: false }] }
`,
            ),
          ),
          fakeDeps(),
        )
      ).tests;

      expect(test?.failures).toEqual([]);
    });

    it("fails a case whose program has no result left, naming the step and the agent", async () => {
      const ran = await failuresOf(
        agent("coder", "harness: codex\n"),
        fixWorkflow,
        fixCase("    expect: { final: done, context: { fix: x } }\n"),
      );

      expect(ran.failures).toEqual([{ kind: "unscripted-program", step: "code", agent: "coder" }]);
    });

    it("fails a case whose results are left over, per agent", async () => {
      const ran = await failuresOf(
        agent("coder", "harness: codex\n"),
        fixWorkflow,
        fixCase(`    programs: { coder: [one, two, three], reviewer: [{ output: null }] }
    expect: { final: done }
`),
      );

      expect(ran.failures).toEqual([
        { kind: "unused-program-results", agent: "coder", count: 2 },
        { kind: "unused-program-results", agent: "reviewer", count: 1 },
      ]);
    });
  });
});
