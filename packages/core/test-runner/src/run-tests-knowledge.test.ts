import type {
  KnowledgeHit,
  KnowledgeProvider,
  KnowledgeProviderContext,
  KnowledgeProviderFactory,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "./run-tests.ts";
import { fakeDeps, fakeModel } from "./test/fakes.ts";
import { agent, testFile, testInput, workflow } from "./test/workspaces.ts";
import type { TestKnowledge } from "./test-deps.ts";

const refunds: KnowledgeHit = {
  ref: "handbook/refunds.md",
  title: "Refunds",
  snippet: "Refunds take 3 days.",
  score: 1,
};

/** A `fake` factory whose sources find the refunds passage, and notes what it built and searched. */
function fakeKnowledge() {
  const built: { id: string; basePath: string }[] = [];
  const queries: string[] = [];
  const factory: KnowledgeProviderFactory = {
    type: "fake",
    create: (source, context): KnowledgeProvider => {
      built.push({ id: source.id, basePath: context.basePath });
      return {
        id: source.id,
        capabilities: { search: true, semantic: false, ingest: false },
        search: async (query) => {
          queries.push(query);
          return [refunds];
        },
        get: async () => null,
      };
    },
  };
  const knowledge: TestKnowledge = {
    factories: [factory],
    contextOf: (hubId): KnowledgeProviderContext => ({
      store: {
        location: "memory:test",
        list: async () => [],
        read: async () => null,
        version: async () => "v1",
      },
      basePath: `hubs/${hubId}`,
      http: {
        fetch: async () => {
          throw new Error("The fake source doesn't go online.");
        },
      },
      secrets: { get: async () => null },
    }),
  };
  return { knowledge, built, queries };
}

/** The fake deps with the given knowledge, keeping each case's model to read its requests. */
function recordingDeps(knowledge?: TestKnowledge) {
  const models: ReturnType<typeof fakeModel>[] = [];
  const deps = fakeDeps({
    ...(knowledge === undefined ? {} : { knowledge }),
    model: (script) => {
      const model = fakeModel(script);
      models.push(model);
      return model;
    },
  });
  return { deps, models };
}

/** A workspace whose helper lists the handbook, with the given `mode`, and answers one question. */
function handbookInput(mode: "tools" | "auto", mocks: string) {
  return testInput(
    agent("helper", "knowledge: [handbook]\n"),
    {
      "hubs/billing/library/knowledge/handbook.yaml": `version: 1\nid: handbook\nprovider: fake\nmode: ${mode}\n`,
    },
    workflow(
      "ask",
      `id: ask
name: Ask
initial: s
states:
  s: { type: task, agent: helper, input: How long do refunds take?, output: answer, on: [{ to: end }] }
  end: { type: final }
`,
    ),
    testFile(
      "ask",
      `workflow: ask
cases:
  - name: answers from the handbook
    mocks: { helper: ${mocks} }
    expect: { final: end, context: { answer: Three days. } }
`,
    ),
  );
}

verifies("test-runner.run-tests", () => {
  describe("runWorkspaceTests with knowledge", () => {
    it("builds the sources an agent lists, and lets it search them", async () => {
      const input = await handbookInput(
        "tools",
        `['tool:knowledge_search {"source": "handbook", "query": "refund time"}', Three days.]`,
      );
      const { knowledge, built, queries } = fakeKnowledge();
      const { deps, models } = recordingDeps(knowledge);

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      expect(built).toEqual([{ id: "handbook", basePath: "hubs/billing" }]);
      expect(queries).toEqual(["refund time"]);
      const tools = models[0]?.requests[0]?.tools?.map((tool) => tool.name);
      expect(tools).toEqual(expect.arrayContaining(["knowledge_search", "knowledge_read"]));
      expect(JSON.stringify(models[0]?.requests[1]?.messages)).toContain("Refunds take 3 days.");
    });

    it("puts a `mode: auto` source's passages in the prompt before the first model call", async () => {
      const input = await handbookInput("auto", "[Three days.]");
      const { knowledge, queries } = fakeKnowledge();
      const { deps, models } = recordingDeps(knowledge);

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      expect(queries).toHaveLength(1);
      expect(JSON.stringify(models[0]?.requests[0]?.messages)).toContain("Refunds take 3 days.");
    });

    it("builds no sources when the caller gives no knowledge", async () => {
      const input = await handbookInput("auto", "[Three days.]");
      const { deps, models } = recordingDeps();

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      const tools = models[0]?.requests[0]?.tools?.map((tool) => tool.name) ?? [];
      expect(tools).not.toContain("knowledge_search");
      expect(JSON.stringify(models[0]?.requests[0]?.messages)).not.toContain("Refunds");
    });
  });
});
