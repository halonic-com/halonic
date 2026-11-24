import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { HostSettings } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { agentOfKind, chatAgentsOf, modelOptionsOf } from "./chat-models.ts";

const acme = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "models.yaml": [
    "aliases:",
    "  default: { provider: mock, model: echo }",
    "  cloud: { provider: anthropic, model: claude-sonnet-5-5 }",
  ].join("\n"),
  "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
  "providers/anthropic.yaml":
    "id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: anthropic-api-key\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
  "hubs/support/agents/triage.agent.yaml":
    "id: triage\nname: Triage\ndescription: Sorts incoming mail\nmodel: cloud\n",
  "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Reply writer\n",
};

const localOnly = "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n";

function settingsOf(values: Record<string, unknown> = {}): Pick<HostSettings, "get"> {
  const map = new Map(Object.entries(values));
  return {
    get: (setting) => (map.has(setting.key) ? map.get(setting.key) : setting.fallback),
  } as Pick<HostSettings, "get">;
}

const load = (files: Record<string, string> = {}) =>
  loadWorkspace(new MemoryDefinitionStore({ ...acme, ...files }, "memory:acme"));

const device = {
  "assistant.provider": "anthropic",
  "assistant.model": "claude-sonnet-5-5",
  "assistant.secret-name": "anthropic-api-key",
};

verifies("assistant.chat.model-per-chat", () => {
  describe("modelOptionsOf", () => {
    it("lists a model whose key isn't stored with its reason, never leaving it out", async () => {
      const options = await modelOptionsOf(await load(), settingsOf(), async () => false);
      expect(options.map((option) => [option.label, option.problem])).toEqual([
        ["cloud", { kind: "needs-key", provider: "Anthropic", secretName: "anthropic-api-key" }],
        ["default", null],
      ]);
    });

    it("says a cloud model can't be used in a local-only workspace", async () => {
      const workspace = await load({ "workspace.yaml": localOnly });
      const options = await modelOptionsOf(workspace, settingsOf(device), async () => true);
      expect(options.map((option) => [option.label, option.problem?.kind ?? null])).toEqual([
        ["claude-sonnet-5-5", "local-only"],
        ["cloud", "local-only"],
        ["default", null],
      ]);
      expect(options[0]?.problem).toEqual({ kind: "local-only", workspace: "Acme" });
    });

    it("says the Settings › Assistant model needs its key when none is stored", async () => {
      const [first] = await modelOptionsOf(await load(), settingsOf(device), async () => false);
      expect(first).toMatchObject({
        model: { kind: "assistant" },
        from: "settings",
        problem: { kind: "needs-key", provider: "Anthropic" },
      });
    });
  });
});

verifies("assistant.chat.switch-build-or-agent", () => {
  describe("chatAgentsOf", () => {
    it("lists the agents by name, each with its model, else default", async () => {
      expect(chatAgentsOf(await load())).toEqual([
        {
          kind: "agent:support/writer",
          name: "Reply writer",
          description: undefined,
          model: "default",
        },
        {
          kind: "agent:support/triage",
          name: "Triage",
          description: "Sorts incoming mail",
          model: "cloud",
        },
      ]);
      expect(agentOfKind("agent:support/triage")).toEqual({ hubId: "support", agentId: "triage" });
      expect(agentOfKind("build")).toBeUndefined();
    });
  });
});
