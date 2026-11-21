import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { workspaceModelResolver } from "@halonicjs/adapter-workspace-models";
import { createServer } from "@halonicjs/host-server";
import {
  type ChatAgentSettings,
  type HttpClient,
  noKeyOrigins,
  type Secrets,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { definitionsOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { committedVersions } from "../../test/committed-versions.ts";
import { workspaceModelSettings } from "./model-settings-gate.ts";

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

/** This test starts a real git repository and commits twice (see `committedVersions`). */
const slowTest = { timeout: 60_000 };

const settings = (rest: Partial<ChatAgentSettings>): ChatAgentSettings => ({
  type: "openai",
  model: "gpt-5",
  local: false,
  ...rest,
});

describe("the model settings of a served chat turn", () => {
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

    it(
      "follows a provider's secret once the change is committed, before a run starts",
      slowTest,
      async () => {
        await workspaceOf();
        const { versions, commitAll } = await committedVersions(root);
        try {
          const gate = workspaceModelSettings(() => versions.live());
          const allows = (secret: string) => gate.allows("support", settings({ secret }));
          expect(await allows("openai-key")).toBe(true);

          writeFileSync(
            join(root, "providers/openai.yaml"),
            "id: openai\ntype: openai\nsecret: openai-team-key\n",
          );
          // Saved but not committed: the live version still names the old secret.
          expect(await allows("openai-team-key")).toBe(false);
          await commitAll();

          expect(await allows("openai-team-key")).toBe(true);
          expect(await allows("openai-key")).toBe(false);
        } finally {
          await versions.close();
        }
      },
    );

    it(
      "refuses every secret while the live version fails the trust check a run's version passes",
      slowTest,
      async () => {
        await workspaceOf();
        const { versions, commitAll } = await committedVersions(root);
        try {
          versions.checkWith({
            // Stands in for `halonic trust`: the committed address below was never trusted here.
            trust: async (workspace) => {
              const proxy = definitionsOf(workspace, "support").providers["proxy"];
              if (proxy?.baseUrl?.includes("evil.example") === true) {
                throw new Error("not trusted here");
              }
              return null;
            },
            sandbox: async () => {},
          });
          const gate = workspaceModelSettings(() => versions.trustedLive());
          const proxyAt = (baseUrl: string) =>
            gate.allows(
              "support",
              settings({ type: "openai-compatible", secret: "proxy-key", baseUrl }),
            );
          expect(await proxyAt("https://llm.acme.example/v1")).toBe(true);

          writeFileSync(
            join(root, "providers/proxy.yaml"),
            "id: proxy\ntype: openai-compatible\nbaseUrl: https://evil.example/v1\nsecret: proxy-key\n",
          );
          await commitAll();

          // The committed file names the new address, but nobody trusted it: no key goes anywhere.
          expect(await proxyAt("https://evil.example/v1")).toBe(false);
          expect(await proxyAt("https://llm.acme.example/v1")).toBe(false);
          expect(await gate.allows("support", settings({ secret: "openai-key" }))).toBe(false);
          // A turn that sends no key still passes.
          expect(await gate.allows("support", settings({}))).toBe(true);
        } finally {
          await versions.close();
        }
      },
    );

    it("sends no model request for a stored key and an address its provider doesn't name", async () => {
      const workspace = await workspaceOf();
      const requests: string[] = [];
      const http: HttpClient = {
        fetch: async (url) => {
          requests.push(String(url));
          throw new TypeError("fetch failed");
        },
      };
      const secrets: Secrets = {
        get: async (name) => (name === "openai-key" ? "sk-stored" : null),
      };
      const resolve = workspaceModelResolver({
        workspace,
        secrets,
        http,
        isTrusted: () => true,
        keyOrigins: noKeyOrigins,
      });
      const server = createServer({
        config: {
          deploymentId: "t",
          version: "0",
          minAppVersion: "0",
          allowedHosts: ["localhost"],
          maxBodyBytes: 4096,
        },
        ports: {
          modelSettings: workspaceModelSettings(async () => workspace),
          runs: {
            chatTurn: async (request: { hubId: string }) => {
              const model = await resolve(request as never);
              await model.provider.chat({ model: model.model, messages: [], tools: [] } as never);
              return {};
            },
          },
          trust: { check: async () => ({ state: "trusted", message: "" }) },
          secrets: { get: async () => null },
          errorLog: { record: () => {} },
        } as never,
      });
      const response = await server.handle(
        new Request("http://localhost/api/chat-turn", {
          method: "POST",
          headers: { host: "localhost", "content-type": "application/json" },
          body: JSON.stringify({
            hubId: "support",
            messages: [{ role: "user", content: "hi" }],
            tools: [],
            agent: settings({ secret: "openai-key", baseUrl: "https://evil.example/v1" }),
          }),
        }),
      );

      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe("model_address_not_allowed");
      expect(requests).toEqual([]);
    });
  });
});
