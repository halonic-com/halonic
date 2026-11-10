// The old runner's parallel suite, through `runWorkspaceTests`: a researcher
// and a critic work at once, and a writer gets both answers.

import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { fakeDeps, fakeModel, promptsOf, recordingDeps } from "../test/fakes.ts";
import { agent, testFile, testInput, workflow } from "../test/workspaces.ts";
import type { ModelScript } from "../test-deps.ts";

/** The research workflow, with the parallel step's extra keys. */
function research(extra = "") {
  return workflow(
    "research",
    `id: research
name: Research
initial: gather
states:
  gather:
    type: parallel
    branches:
      facts: { agent: researcher, input: "Facts about {{input.topic}}" }
      risks: { agent: critic, input: "Risks of {{input.topic}}" }
    output: research
${extra}    on: [{ to: write }]
  write: { type: task, agent: writer, input: "{{context.facts}} / {{context.risks}}", output: text, on: [{ to: end }] }
  end: { type: final }
`,
  );
}

const researchTests = testFile(
  "research",
  `workflow: research
cases:
  - name: both branches feed the writer
    input: { topic: tides }
    mocks: { researcher: [moon], critic: [floods], writer: [done] }
    expect: { final: end, context: { facts: moon, risks: floods, research: { facts: moon, risks: floods } } }
`,
);

const agents = [agent("researcher"), agent("critic"), agent("writer")];

/** A scripted model whose critic can't be reached. */
function criticOffline(script: ModelScript) {
  const model = fakeModel(script);
  const chat = model.provider.chat;
  return {
    ...model,
    provider: {
      ...model.provider,
      chat: async (request: Parameters<typeof chat>[0]) => {
        if (request.meta?.agentId === "critic") throw new Error("The critic's model is offline.");
        return chat(request);
      },
    },
    // The critic's reply is never asked for, so it doesn't count as unused.
    remaining: () => ({ ...model.remaining(), critic: 0 }),
  };
}

verifies("test-runner.old-suites", () => {
  describe("parallel steps", () => {
    it("run every branch, tag their events, and merge the results into the context", async () => {
      const input = await testInput(...agents, research(), researchTests);
      const { deps, models } = recordingDeps();

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      expect(promptsOf(models[0]).at(-1)).toEqual(["writer", "moon / floods"]);
      const events = test?.runs[0]?.events ?? [];
      const started = events.flatMap((event) =>
        event.type === "agent.started" ? [[event.agent, event.branch ?? null]] : [],
      );
      expect(started).toEqual([
        ["researcher", "facts"],
        ["critic", "risks"],
        ["writer", null],
      ]);
      // The log stays numbered in order even though the branches ran at once.
      expect(events.map((event) => event.seq)).toEqual(events.map((_, index) => index + 1));
    });

    it("fail the case when a branch fails, unless continueOnError or join any", async () => {
      const run = async (extra: string) => {
        const input = await testInput(...agents, research(extra), researchTests);
        const [test] = (await runWorkspaceTests(input, fakeDeps({ model: criticOffline }))).tests;
        return test;
      };

      const failed = await run("");
      const tolerant = await run("    continueOnError: true\n");
      const any = await run("    join: any\n");

      // The run stopped before it set anything, and the writer was never asked.
      expect(failed?.failures.map((failure) => failure.kind)).toEqual([
        "status",
        "context",
        "context",
        "context",
        "unused-replies",
      ]);
      expect(failed?.failures[0]).toEqual({
        kind: "status",
        expected: "completed",
        actual: "failed",
        step: "gather",
      });
      expect(failed?.runs[0]?.summary.error).toContain("offline");
      expect(tolerant?.failures).toEqual([
        {
          kind: "context",
          path: "risks",
          expected: "floods",
          set: true,
          actual: { error: expect.stringContaining("offline") },
        },
        {
          kind: "context",
          path: "research.risks",
          expected: "floods",
          set: true,
          actual: { error: expect.stringContaining("offline") },
        },
      ]);
      expect(any?.runs[0]?.summary.status).toBe("completed");
    });

    it("fail the case when a branch's answer isn't one of its agent's options", async () => {
      const critic = agent("critic", "output: { type: choice, options: [low, high] }\n");
      const input = await testInput(
        agent("researcher"),
        critic,
        agent("writer"),
        research(),
        researchTests,
      );

      const [test] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(test?.failures[0]).toEqual({
        kind: "status",
        expected: "completed",
        actual: "failed",
        step: "gather",
      });
      expect(test?.runs[0]?.summary.error).toContain(
        `answered "floods", which isn't one of its options`,
      );
    });
  });
});
