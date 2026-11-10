import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { ChatTurnRequest, HttpClient, Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workspaceModelResolver } from "./workspace-model-resolver.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-workspace-models-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes the files, by path in the workspace, and loads the workspace from them. */
async function workspaceOf(files: Record<string, string>): Promise<LoadedWorkspace> {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

/** The Acme workspace: a `support` hub whose `writer` uses `smart`, which falls back to `fast`. */
const acmeFiles: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  model: fast\n",
  "providers/anthropic.yaml": "id: anthropic\ntype: anthropic\nsecret: anthropic-key\n",
  "providers/mock.yaml": "id: mock\ntype: mock\n",
  "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
  "models.yaml": [
    "aliases:",
    "  smart:",
    "    provider: anthropic",
    "    model: claude-opus-5-5",
    "    price: { input: 5, output: 25 }",
    "    fallback: [fast]",
    "  fast:",
    "    provider: mock",
    "    model: echo",
    "  local:",
    "    provider: ollama",
    "    model: qwen3",
    "",
  ].join("\n"),
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
  "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\nmodel: smart\n",
  "hubs/support/agents/helper.agent.yaml": "id: helper\nname: Helper\n",
};

const http: HttpClient = {
  fetch: async () => {
    throw new TypeError("fetch failed");
  },
};
const secrets: Secrets = { get: async () => null };

/** A run's model call in `support`, as the engine makes it. */
function callOf(fields: Partial<ChatTurnRequest> = {}): ChatTurnRequest {
  return { hubId: "support", messages: [{ role: "user", content: "Hi" }], tools: [], ...fields };
}

async function resolverFor(files: Record<string, string> = acmeFiles) {
  return workspaceModelResolver({ workspace: await workspaceOf(files), secrets, http });
}

verifies("cli.workspace-models", () => {
  describe("which model a call gets", () => {
    it("gives an agent its model, with the provider's secret name, the price and the fallbacks", async () => {
      const resolve = await resolverFor();

      const model = await resolve(callOf({ agentId: "writer" }));

      expect(model).toMatchObject({
        model: "claude-opus-5-5",
        alias: "smart",
        secret: "anthropic-key",
        local: false,
        price: { input: 5, output: 25 },
      });
      expect(model.price).toEqual({ input: 5, output: 25 });
      expect(model.provider.type).toBe("anthropic");
      expect(model.fallback?.map((next) => [next.alias, next.model, next.local])).toEqual([
        ["fast", "echo", true],
      ]);
    });

    it("puts the call's own alias before the agent's model", async () => {
      const resolve = await resolverFor();

      const model = await resolve(callOf({ agentId: "writer", alias: "local" }));

      expect(model).toMatchObject({ alias: "local", model: "qwen3", local: true });
      expect(model.provider.type).toBe("ollama");
      expect(model.secret).toBeUndefined();
    });

    it("gives an agent without a model the workspace's default", async () => {
      const resolve = await resolverFor();

      expect(await resolve(callOf({ agentId: "helper" }))).toMatchObject({ alias: "fast" });
    });

    it("puts the hub's default before the workspace's", async () => {
      const resolve = await resolverFor({
        ...acmeFiles,
        "hubs/support/hub.yaml": "id: support\nname: Support\ndefaults:\n  model: local\n",
      });

      expect(await resolve(callOf({ agentId: "helper" }))).toMatchObject({ alias: "local" });
    });

    it("takes provider/model as a model at that provider, without an alias", async () => {
      const resolve = await resolverFor();

      const model = await resolve(callOf({ alias: "ollama/llama3.2" }));

      expect(model).toMatchObject({ model: "llama3.2", local: true, fallback: [] });
      expect(model.alias).toBeUndefined();
    });

    it("gives the agent editor's unsaved settings a provider of their own", async () => {
      const resolve = await resolverFor();

      const model = await resolve(
        callOf({
          agentId: "writer",
          agent: { type: "openai", model: "gpt-5", secret: "openai-key", local: false },
        }),
      );

      expect(model).toMatchObject({ model: "gpt-5", secret: "openai-key", local: false });
      expect(model.provider.type).toBe("openai");
    });

    it("builds each provider once", async () => {
      const resolve = await resolverFor();

      const first = await resolve(callOf({ agentId: "writer" }));
      const second = await resolve(callOf({ alias: "smart" }));

      expect(second.provider).toBe(first.provider);
      expect(second.fallback?.[0]?.provider).toBe(first.fallback?.[0]?.provider);
    });
  });

  describe("a call with no model to go to", () => {
    it("names an alias the hub doesn't have", async () => {
      const resolve = await resolverFor();

      await expect(resolve(callOf({ alias: "huge" }))).rejects.toMatchObject({
        code: "unknown-model-alias",
        kind: "not_found",
        message: "hub support has no model alias huge.",
      });
    });

    it("names a provider the workspace doesn't have", async () => {
      const resolve = await resolverFor();

      await expect(resolve(callOf({ alias: "gone/acme-1" }))).rejects.toMatchObject({
        code: "no-provider",
        kind: "not_found",
        fix: "Add providers/gone.yaml, then run again.",
      });
    });

    it("names the workspace's default alias when models.yaml doesn't have it", async () => {
      const resolve = await resolverFor({
        ...acmeFiles,
        "workspace.yaml": "id: acme\nname: Acme\n",
      });

      await expect(resolve(callOf({ agentId: "helper" }))).rejects.toMatchObject({
        code: "unknown-model-alias",
        message: "hub support has no model alias default.",
      });
    });
  });
});
