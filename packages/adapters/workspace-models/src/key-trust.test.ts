import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { noListedToolApproval } from "@halonicjs/engine";
import {
  type ChatTurnRequest,
  type Clock,
  type HttpClient,
  noKeyOrigins,
  type Secrets,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keyDestination, workspaceExecutorOptions, workspaceModelResolver } from "./index.ts";

let root: string;

beforeEach(() => {
  sent.length = 0;
  root = mkdtempSync(join(tmpdir(), "halonic-key-trust-"));
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

const secrets: Secrets = { get: async () => "fake-key" };
const clock: Clock = { now: () => new Date("2026-11-15T10:00:00.000Z") };
/** The addresses a call was sent to, so a test sees that nothing was. */
const sent: string[] = [];
const http: HttpClient = {
  fetch: async (url) => {
    sent.push(String(url));
    throw new TypeError("fetch failed");
  },
};

/** One provider file with a stored key, as the cases below write it. */
interface Case {
  readonly name: string;
  readonly type: string;
  readonly baseUrl?: string;
  readonly secret?: string;
  readonly origin: string | undefined;
  readonly isDefault: boolean;
}

const withKey = "fake-key-name";

/** Where a stored key goes, by the provider file's type and `baseUrl`. */
const cases: readonly Case[] = [
  {
    name: "anthropic without baseUrl",
    type: "anthropic",
    secret: withKey,
    origin: "https://api.anthropic.com",
    isDefault: true,
  },
  {
    name: "anthropic at its own address",
    type: "anthropic",
    baseUrl: "https://api.anthropic.com",
    secret: withKey,
    origin: "https://api.anthropic.com",
    isDefault: true,
  },
  {
    name: "openai without baseUrl",
    type: "openai",
    secret: withKey,
    origin: "https://api.openai.com",
    isDefault: true,
  },
  {
    name: "openai at its own address, with a path",
    type: "openai",
    baseUrl: "https://api.openai.com/v1/",
    secret: withKey,
    origin: "https://api.openai.com",
    isDefault: true,
  },
  {
    name: "openai over http",
    type: "openai",
    baseUrl: "http://api.openai.com/v1",
    secret: withKey,
    origin: "http://api.openai.com",
    isDefault: false,
  },
  {
    name: "openai on another port",
    type: "openai",
    baseUrl: "https://api.openai.com:8443/v1",
    secret: withKey,
    origin: "https://api.openai.com:8443",
    isDefault: false,
  },
  {
    name: "openai at a look-alike host",
    type: "openai",
    baseUrl: "https://api.openai.com.example.com/v1",
    secret: withKey,
    origin: "https://api.openai.com.example.com",
    isDefault: false,
  },
  {
    name: "openai with user info that hides the host",
    type: "openai",
    baseUrl: "https://api.openai.com@example.com/v1",
    secret: withKey,
    origin: undefined,
    isDefault: false,
  },
  {
    name: "openai with a user name and password",
    type: "openai",
    baseUrl: "https://user:pass@api.openai.com/v1",
    secret: withKey,
    origin: undefined,
    isDefault: false,
  },
  {
    name: "openai at an IP address",
    type: "openai",
    baseUrl: "https://203.0.113.5/v1",
    secret: withKey,
    origin: "https://203.0.113.5",
    isDefault: false,
  },
  {
    name: "openai at an address that doesn't parse",
    type: "openai",
    baseUrl: "not a url",
    secret: withKey,
    origin: undefined,
    isDefault: false,
  },
  {
    name: "openai-compatible, which has no built-in address",
    type: "openai-compatible",
    baseUrl: "https://llm.example.com/v1",
    secret: withKey,
    origin: "https://llm.example.com",
    isDefault: false,
  },
  {
    name: "ollama without baseUrl",
    type: "ollama",
    secret: withKey,
    origin: "http://localhost:11434",
    isDefault: true,
  },
  {
    name: "ollama at its own address",
    type: "ollama",
    baseUrl: "http://localhost:11434/v1",
    secret: withKey,
    origin: "http://localhost:11434",
    isDefault: true,
  },
  {
    name: "ollama by its loopback IP",
    type: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    secret: withKey,
    origin: "http://127.0.0.1:11434",
    isDefault: false,
  },
];

const file = (each: Case) => ({
  id: "main",
  type: each.type,
  local: false,
  options: {},
  ...(each.baseUrl === undefined ? {} : { baseUrl: each.baseUrl }),
  ...(each.secret === undefined ? {} : { secret: each.secret }),
});

/** A workspace whose `agent` alias is served by the `main` provider of `each`. */
async function workspaceFor(each: Case): Promise<LoadedWorkspace> {
  return await workspaceOf({
    "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  model: main/model-1\n",
    "providers/main.yaml": [
      "id: main",
      `type: ${each.type}`,
      ...(each.baseUrl === undefined ? [] : [`baseUrl: ${JSON.stringify(each.baseUrl)}`]),
      ...(each.secret === undefined ? [] : [`secret: ${each.secret}`]),
      "",
    ].join("\n"),
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
  });
}

const call: ChatTurnRequest = {
  hubId: "support",
  alias: "main/model-1",
  messages: [{ role: "user", content: "Hi" }],
  tools: [],
};

/** The entry points that resolve a model: the resolver itself, and the executor options the CLI's and Studio's engines both build. */
const entryPoints = {
  resolver: (workspace: LoadedWorkspace, isTrusted: () => boolean | Promise<boolean>) =>
    workspaceModelResolver({ workspace, secrets, http, isTrusted, keyOrigins: noKeyOrigins }),
  "executor options": (workspace: LoadedWorkspace, isTrusted: () => boolean | Promise<boolean>) =>
    workspaceExecutorOptions({
      workspace,
      secrets,
      http,
      clock,
      isTrusted,
      keyOrigins: noKeyOrigins,
      listedToolApproval: noListedToolApproval,
    }).resolveModel,
};

verifies("cli.workspace-provider-key-trust", () => {
  describe("where a provider's stored key goes", () => {
    it.each(cases)("$name", (each) => {
      expect(keyDestination(file(each))).toEqual({
        provider: "main",
        origin: each.origin ?? "an address that can't be read",
        isDefault: each.isDefault,
      });
    });

    it("is nowhere for a provider with no stored key, or the mock model", () => {
      expect(
        keyDestination({
          id: "main",
          type: "openai-compatible",
          baseUrl: "https://llm.example.com/v1",
        }),
      ).toBeUndefined();
      expect(keyDestination({ id: "main", type: "mock", secret: withKey })).toBeUndefined();
    });
  });

  describe.each(Object.entries(entryPoints))("a model call through the %s", (_name, resolverOf) => {
    const loadable = cases.filter((each) => each.origin !== undefined);

    it.each(loadable)(
      "$name: refused when the workspace isn't trusted, as a key off its address when it is one",
      async (each) => {
        const resolve = resolverOf(await workspaceFor(each), () => false);

        if (each.isDefault) {
          await expect(resolve(call)).rejects.toMatchObject({
            code: "untrusted-workspace",
            kind: "denied",
          });
          return;
        }
        await expect(resolve(call)).rejects.toMatchObject({
          code: "untrusted-provider-address",
          kind: "denied",
          message: `provider main would send its key to ${each.origin}, and this workspace isn't trusted on this computer.`,
          fix: "Check providers/main.yaml, then trust the workspace, or point it at the type's own address.",
        });
      },
    );

    it.each(loadable)("$name: goes through when the workspace is trusted", async (each) => {
      const resolve = resolverOf(await workspaceFor(each), async () => true);

      await expect(resolve(call)).resolves.toMatchObject({ secret: withKey });
    });

    it("refuses when the trust check itself fails", async () => {
      const [each] = cases;
      const resolve = resolverOf(await workspaceFor(each as Case), async () => {
        throw new Error("The trust record can't be read.");
      });

      await expect(resolve({ ...call, alias: "main/model-1" })).rejects.toThrow("can't be read");
    });

    it("never names the key or the path in the refusal", async () => {
      const each = cases.find(
        (c) => c.name === "openai-compatible, which has no built-in address",
      ) as Case;
      const resolve = resolverOf(await workspaceFor(each), () => false);

      const refusal = await resolve(call).then(
        () => "",
        (error: unknown) => (error instanceof Error ? error.message : ""),
      );

      expect(refusal).toContain("provider main would send its key to");
      expect(refusal).not.toContain("fake-key");
      expect(refusal).not.toContain("/v1");
    });

    it("refuses the agent editor's unsaved settings the same way", async () => {
      const [each] = cases;
      const resolve = resolverOf(await workspaceFor(each as Case), () => false);
      const unsaved = (baseUrl?: string): ChatTurnRequest => ({
        ...call,
        agent: {
          type: "openai-compatible",
          model: "model-1",
          local: false,
          secret: withKey,
          ...(baseUrl === undefined ? {} : { baseUrl }),
        },
      });

      await expect(resolve(unsaved("https://llm.example.com/v1"))).rejects.toMatchObject({
        code: "untrusted-provider-address",
      });
      await expect(
        resolve({
          ...unsaved(),
          agent: { type: "anthropic", model: "m", local: false, secret: withKey },
        }),
      ).rejects.toMatchObject({ code: "untrusted-workspace" });
    });
  });
});

verifies("cli.workspace-provider-key-trust", () => {
  describe.each(Object.entries(entryPoints))(
    "an untrusted workspace through the %s (HAL-12409)",
    (_name, resolverOf) => {
      const keyless = {
        "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  model: ollama/qwen3\n",
        "providers/ollama.yaml": [
          "id: ollama",
          "type: openai-compatible",
          "baseUrl: http://localhost:11434/v1",
          "local: true",
          "",
        ].join("\n"),
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
      };

      it("refuses a keyless provider on this computer, and sends nothing", async () => {
        const resolve = resolverOf(await workspaceOf(keyless), () => false);

        await expect(resolve({ ...call, alias: "ollama/qwen3" })).rejects.toMatchObject({
          code: "untrusted-workspace",
          kind: "denied",
          message:
            "provider ollama calls a real model, and this workspace isn't trusted on this computer, so nothing was sent.",
          fix: "Check the workspace, then trust it, or set type: mock in providers/ollama.yaml to use the test model.",
        });
        expect(sent).toEqual([]);
      });

      it("calls the same provider once the workspace is trusted", async () => {
        const resolve = resolverOf(await workspaceOf(keyless), () => true);

        await expect(resolve({ ...call, alias: "ollama/qwen3" })).resolves.toMatchObject({
          model: "qwen3",
          local: true,
        });
      });

      it("still calls the test model", async () => {
        const resolve = resolverOf(
          await workspaceOf({
            "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  model: test/echo\n",
            "providers/test.yaml": "id: test\ntype: mock\n",
            "hubs/support/hub.yaml": "id: support\nname: Support\n",
          }),
          () => false,
        );

        await expect(resolve({ ...call, alias: "test/echo" })).resolves.toMatchObject({
          model: "echo",
          local: true,
        });
      });

      it("refuses the agent editor's unsaved settings for a keyless local model", async () => {
        const resolve = resolverOf(await workspaceOf(keyless), () => false);

        await expect(
          resolve({
            ...call,
            agent: {
              type: "openai-compatible",
              model: "qwen3",
              local: true,
              baseUrl: "http://localhost:11434/v1",
            },
          }),
        ).rejects.toMatchObject({ code: "untrusted-workspace" });
      });
    },
  );
});
