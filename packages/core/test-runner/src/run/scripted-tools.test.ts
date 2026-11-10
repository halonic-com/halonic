import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { fakeDeps, fakeModel } from "../test/fakes.ts";
import { agent, testFile, testInput, workflow } from "../test/workspaces.ts";

const crm = {
  "library/connectors/crm.connector.yaml": `id: crm
name: CRM
transport: { http: { url: "https://crm.acme.test/mcp" } }
tools: { allow: [lookup, update], approve: [update] }
`,
};

const lookupWorkflow = workflow(
  "lookup",
  `id: lookup
name: Lookup
initial: find
states:
  find: { type: task, agent: clerk, input: "Find Acme Paper", output: answer, on: [{ to: done }] }
  done: { type: final }
`,
);

/** A test file with one case for the lookup workflow. */
function lookupCase(body: string) {
  return testFile("lookup", `workflow: lookup\ncases:\n  - name: finds the vendor\n${body}`);
}

verifies("test-runner.scripted-tools", () => {
  describe("scripted connector tools", () => {
    it("answers each call with the next scripted result, never a real server", async () => {
      const input = await testInput(
        crm,
        agent("clerk", "connectors: [crm]\n"),
        lookupWorkflow,
        lookupCase(`    mocks: { clerk: ['tool:lookup {"name": "Acme Paper"}', Found it.] }
    tools: { crm.lookup: ['{"vendor": "Acme Paper"}'] }
    expect: { final: done, context: { answer: Found it. } }
`),
      );

      const models: ReturnType<typeof fakeModel>[] = [];
      const deps = fakeDeps({
        model: (script) => {
          const model = fakeModel(script);
          models.push(model);
          return model;
        },
      });

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      // The run log doesn't record a turn's read calls yet, so the model's second request shows it.
      const answered = models[0]?.requests[1]?.messages.at(-1);
      expect(answered).toMatchObject({ role: "tool", content: '{"vendor": "Acme Paper"}' });
    });

    it("fails a case whose run calls a tool it has no result for", async () => {
      const input = await testInput(
        crm,
        agent("clerk", "connectors: [crm]\n"),
        lookupWorkflow,
        lookupCase(`    mocks: { clerk: ['tool:lookup {"name": "Acme Paper"}', Not found.] }
    expect: { final: done }
`),
      );

      const [test] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(test?.failures).toEqual([{ kind: "unscripted-tool", tool: "crm.lookup" }]);
    });

    it("fails a case with results its run never used", async () => {
      const input = await testInput(
        crm,
        agent("clerk", "connectors: [crm]\n"),
        lookupWorkflow,
        lookupCase(`    mocks: { clerk: [Found it.] }
    tools: { crm.lookup: [one, two] }
    expect: { final: done }
`),
      );

      const [test] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(test?.failures).toEqual([
        { kind: "unused-tool-results", tool: "crm.lookup", count: 2 },
      ]);
    });

    it("asks a person first for a tool the connector says needs approval", async () => {
      const input = await testInput(
        crm,
        agent("clerk", "connectors: [crm]\n"),
        lookupWorkflow,
        lookupCase(`    mocks: { clerk: ['tool:update {"name": "Acme Paper"}'] }
    tools: { crm.update: [done] }
    expect: { status: waiting }
`),
      );

      const [test] = (await runWorkspaceTests(input, fakeDeps())).tests;

      // The call waits for its OK, so its result is still unused.
      expect(test?.failures).toEqual([
        { kind: "unused-tool-results", tool: "crm.update", count: 1 },
      ]);
      expect(test?.runs[0]?.summary.approvals).toMatchObject([{ tool: "update" }]);
    });
  });
});
