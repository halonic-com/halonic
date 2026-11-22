import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { ChatAgentSettings } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workspaceModelSettings } from "./index.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-model-settings-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const files: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "providers/openai.yaml": "id: openai\ntype: openai\nsecret: openai-key\n",
  "providers/proxy.yaml":
    "id: proxy\ntype: openai-compatible\nbaseUrl: https://llm.acme.example/v1/\nsecret: proxy-key\n",
  "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
};

async function workspaceOf(): Promise<LoadedWorkspace> {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

const settings = (rest: Partial<ChatAgentSettings>): ChatAgentSettings => ({
  type: "openai",
  model: "gpt-5",
  local: false,
  ...rest,
});

describe("workspaceModelSettings", () => {
  verifies("server.chat-turn-model-address", () => {
    it("allows a secret only with the address its provider names", async () => {
      const gate = workspaceModelSettings(await workspaceOf().then((w) => async () => w));
      const allows = (hub: string, rest: Partial<ChatAgentSettings>) =>
        gate.allows(hub, settings(rest));

      expect(await allows("support", { secret: "openai-key" })).toBe(true);
      expect(
        await allows("support", { secret: "openai-key", baseUrl: "https://api.openai.com/v1/" }),
      ).toBe(true);
      expect(
        await allows("support", {
          type: "openai-compatible",
          secret: "proxy-key",
          baseUrl: "https://llm.acme.example/v1",
        }),
      ).toBe(true);
      expect(await allows("support", { model: "x" })).toBe(true);

      expect(
        await allows("support", { secret: "openai-key", baseUrl: "https://evil.example/v1" }),
      ).toBe(false);
      expect(await allows("support", { secret: "proxy-key" })).toBe(false);
      expect(await allows("support", { secret: "proxy-key", type: "anthropic" })).toBe(false);
      expect(await allows("support", { secret: "unknown-key" })).toBe(false);
      expect(await allows("gone", { secret: "openai-key" })).toBe(false);
    });

    it("refuses every secret while no trusted live version can be read, and still passes a turn with none", async () => {
      const gate = workspaceModelSettings(async () => null);
      expect(await gate.allows("support", settings({ secret: "openai-key" }))).toBe(false);
      expect(await gate.allows("support", settings({}))).toBe(true);
    });
  });
});
