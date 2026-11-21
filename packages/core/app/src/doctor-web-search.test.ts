import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { harnessesLine } from "./doctor-checks.ts";
import { webSearchingAgents } from "./doctor-web-search.ts";
import { agent, answered, doctor, workspace } from "./testing/doctor-fixtures.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** An OpenRouter provider that lists Sonar as searching by itself. */
const openRouter = [
  "id: openrouter",
  "name: OpenRouter",
  "type: openai-compatible",
  "baseUrl: https://openrouter.ai/api/v1",
  "secret: OPENROUTER_API_KEY",
  "searchesWeb: [perplexity/sonar]",
  "",
].join("\n");

const models = [
  "aliases:",
  "  research: { provider: openrouter, model: perplexity/sonar }",
  "  research-upper: { provider: openrouter, model: Perplexity/Sonar }",
  "  coder: { provider: openrouter, model: qwen/qwen3-coder, fallback: [research] }",
  "",
].join("\n");

/** The pairs `harnessCallsProviderType` allows: Claude Code calls Anthropic's API, Codex OpenAI's. */
function harnessCalls(harness: string, providerType: string): boolean {
  if (harness === "claude-code") return providerType === "anthropic";
  return harness === "codex" && (providerType === "openai" || providerType === "openai-compatible");
}

function agentFile(id: string, name: string, lines: readonly string[]): string {
  return [`id: ${id}`, `name: ${name}`, ...lines, ""].join("\n");
}

/** Acme, with `files` added to its workspace, models and OpenRouter provider. */
function acme(files: Record<string, string>): Promise<LoadedWorkspace> {
  return loadWorkspace(
    new TestDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "models.yaml": models,
      "providers/openrouter.yaml": openRouter,
      ...files,
    }),
  );
}

verifies("app.doctor-harness-web-search", () => {
  it("names a harness agent whose alias resolves to a model in searchesWeb", async () => {
    const workspace = await acme({
      "agents/writer.agent.yaml": agentFile("writer", "Writer", [
        "harness: codex",
        "model: research",
      ]),
    });
    expect(webSearchingAgents(workspace, harnessCalls)).toEqual([
      { agent: "Writer", alias: "research", model: "perplexity/sonar", provider: "OpenRouter" },
    ]);
  });

  it("resolves the alias in the agent's own hub", async () => {
    const workspace = await acme({
      "hubs/support/hub.yaml": [
        "id: support",
        "name: Support",
        "models:",
        "  research: { provider: openrouter, model: qwen/qwen3-coder }",
        "",
      ].join("\n"),
      "hubs/support/agents/helper.agent.yaml": agentFile("helper", "Helper", [
        "harness: codex",
        "model: research",
      ]),
      "hubs/sales/hub.yaml": "id: sales\nname: Sales\n",
      "hubs/sales/agents/scout.agent.yaml": agentFile("scout", "Scout", [
        "harness: codex",
        "model: research",
      ]),
    });
    expect(webSearchingAgents(workspace, harnessCalls).map((found) => found.agent)).toEqual([
      "Scout",
    ]);
  });

  it("leaves out Halonic's own loop, a provider/model name, and an id that differs in case", async () => {
    const workspace = await acme({
      "agents/loop.agent.yaml": agentFile("loop", "Loop", ["model: research"]),
      "agents/direct.agent.yaml": agentFile("direct", "Direct", [
        "harness: codex",
        "model: openrouter/perplexity/sonar",
      ]),
      "agents/upper.agent.yaml": agentFile("upper", "Upper", [
        "harness: codex",
        "model: research-upper",
      ]),
      "agents/program.agent.yaml": agentFile("program", "Program", [
        "harness: codex",
        "model: sonnet",
      ]),
    });
    expect(webSearchingAgents(workspace, harnessCalls)).toEqual([]);
  });

  it("leaves out an alias whose only fallback searches the web, as the bridge tries only the alias", async () => {
    const workspace = await acme({
      "agents/coder.agent.yaml": agentFile("coder", "Coder", ["harness: codex", "model: coder"]),
    });
    expect(webSearchingAgents(workspace, harnessCalls)).toEqual([]);
  });

  it("leaves out an agent whose harness can't call the alias's provider, as its run stops first", async () => {
    const workspace = await acme({
      "agents/writer.agent.yaml": agentFile("writer", "Writer", [
        "harness: claude-code",
        "model: research",
      ]),
      "agents/scout.agent.yaml": agentFile("scout", "Scout", ["harness: codex", "model: research"]),
    });
    expect(webSearchingAgents(workspace, harnessCalls).map((found) => found.agent)).toEqual([
      "Scout",
    ]);
  });

  it("warns under the Harnesses line, one problem per agent, without failing it", () => {
    const line = harnessesLine(
      [
        {
          id: "claude-code",
          name: "Claude Code",
          detection: { status: "ready", version: "2.1.0" },
        },
      ],
      [{ agent: "Writer", harness: "claude-code" }],
      [],
      [{ agent: "Writer", alias: "research", model: "perplexity/sonar", provider: "OpenRouter" }],
    );
    expect(line).toEqual({
      check: "harnesses",
      status: "warning",
      installed: [{ harness: "claude-code", name: "Claude Code", version: "2.1.0" }],
      problems: [
        {
          problem: "searches-web",
          agent: "Writer",
          alias: "research",
          model: "perplexity/sonar",
          provider: "OpenRouter",
        },
      ],
    });
  });

  it("keeps doctor's exit code at 0: the warning is counted, never as a problem", async () => {
    const writer = {
      agent: "Writer",
      alias: "research",
      model: "perplexity/sonar",
      provider: "OpenRouter",
    };
    const report = await doctor().service.check({
      ...workspace({ agents: [agent("Writer", "codex")] }),
      webSearching: [writer],
    });
    expect(report.harnesses?.status).toBe("warning");
    expect(answered(report.harnesses).problems).toContainEqual({
      problem: "searches-web",
      ...writer,
    });
    expect(report.summary.needsFixing).toBe(false);
    expect(report.summary.problems).toBe(0);
  });
});
