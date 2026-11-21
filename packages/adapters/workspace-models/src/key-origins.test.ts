import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { ChatTurnRequest, HttpClient, KeyOrigins, Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workspaceModelResolver } from "./index.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-key-origins-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const secrets: Secrets = { get: async () => "fake-key-value" };
const http: HttpClient = {
  fetch: async () => {
    throw new TypeError("fetch failed");
  },
};
const keyName = "fake-key-name";
const call: ChatTurnRequest = {
  hubId: "support",
  alias: "main/model-1",
  messages: [{ role: "user", content: "Hi" }],
  tools: [],
};

/** The key origins of a test: the list each secret name has, and the names asked about. */
function originsOf(list: Record<string, readonly string[]>): KeyOrigins & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    allowedOrigins: async (name) => {
      asked.push(name);
      return list[name];
    },
  };
}

/** A workspace whose provider `main` has the given type, address and secret, and whose `backup` provider is a second one. */
async function workspaceOf(provider: {
  type: string;
  baseUrl?: string;
  secret?: string;
  fallback?: { type: string; baseUrl: string; secret: string };
}): Promise<LoadedWorkspace> {
  const yaml = (id: string, p: { type: string; baseUrl?: string; secret?: string }) =>
    [
      `id: ${id}`,
      `type: ${p.type}`,
      ...(p.baseUrl === undefined ? [] : [`baseUrl: ${JSON.stringify(p.baseUrl)}`]),
      ...(p.secret === undefined ? [] : [`secret: ${p.secret}`]),
      "",
    ].join("\n");
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  model: main/model-1\n",
    "providers/main.yaml": yaml("main", provider),
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
  };
  if (provider.fallback !== undefined) {
    files["providers/backup.yaml"] = yaml("backup", provider.fallback);
    files["models.yaml"] =
      "aliases:\n  smart:\n    provider: main\n    model: model-1\n    fallback: [spare]\n  spare:\n    provider: backup\n    model: model-2\n";
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

const gateway = "https://llm.example.com";

verifies("cli.workspace-provider-key-trust", () => {
  describe("a key with allowed origins", () => {
    it("goes to an origin on its list in a trusted workspace", async () => {
      const workspace = await workspaceOf({
        type: "openai-compatible",
        baseUrl: `${gateway}/v1`,
        secret: keyName,
      });
      const origins = originsOf({ [keyName]: [gateway] });
      const resolve = workspaceModelResolver({
        workspace,
        secrets,
        http,
        isTrusted: () => true,
        keyOrigins: origins,
      });

      await expect(resolve(call)).resolves.toMatchObject({ secret: keyName });
      expect(origins.asked).toEqual([keyName]);
    });

    it("still needs step A's trust at a listed address that isn't its type's own", async () => {
      const workspace = await workspaceOf({
        type: "openai-compatible",
        baseUrl: `${gateway}/v1`,
        secret: keyName,
      });
      const resolve = workspaceModelResolver({
        workspace,
        secrets,
        http,
        isTrusted: () => false,
        keyOrigins: originsOf({ [keyName]: [gateway] }),
      });

      await expect(resolve(call)).rejects.toMatchObject({ code: "untrusted-provider-address" });
    });

    it.each([
      ["another host", "https://other.example.com/v1"],
      ["http instead of https", "http://llm.example.com/v1"],
      ["another port", "https://llm.example.com:8443/v1"],
      ["a look-alike host", "https://llm.example.com.example.org/v1"],
      ["user info that hides the host", "https://llm.example.com@example.org/v1"],
    ])("is refused at %s in a trusted workspace", async (_label, baseUrl) => {
      const workspace = await workspaceOf({ type: "openai-compatible", baseUrl, secret: keyName });
      const resolve = workspaceModelResolver({
        workspace,
        secrets,
        http,
        isTrusted: () => true,
        keyOrigins: originsOf({ [keyName]: [gateway] }),
      });

      await expect(resolve(call)).rejects.toMatchObject({
        code: "key-origin-not-allowed",
        kind: "denied",
      });
    });

    it("is refused at an address that isn't http or https before its list is asked, as the file fails its own check (HAL-14260)", async () => {
      const workspace = await workspaceOf({
        type: "openai-compatible",
        baseUrl: "ftp://llm.example.com/v1",
        secret: keyName,
      });
      const origins = originsOf({ [keyName]: [gateway] });
      const resolve = workspaceModelResolver({
        workspace,
        secrets,
        http,
        isTrusted: () => true,
        keyOrigins: origins,
      });

      expect(workspace.issues.map((issue) => issue.code)).toContain("provider-base-url");
      await expect(resolve(call)).rejects.toBeInstanceOf(KindedError);
      expect(origins.asked).toEqual([]);
    });

    it("is refused at its type's own address when the list doesn't hold it", async () => {
      const workspace = await workspaceOf({ type: "openai", secret: keyName });
      const resolve = workspaceModelResolver({
        workspace,
        secrets,
        http,
        isTrusted: () => true,
        keyOrigins: originsOf({ [keyName]: [gateway] }),
      });

      await expect(resolve(call)).rejects.toMatchObject({
        code: "key-origin-not-allowed",
        message: `Provider "main" can't send key "${keyName}" to https://api.openai.com. That address isn't allowed for this key. Only allow an address you recognise.`,
        fix: `To allow it, open Models in Halonic Studio, or run: halonic models allow-address "${keyName}" https://api.openai.com`,
      });
    });

    it("names the provider and the origin, never the key or the path", async () => {
      const workspace = await workspaceOf({
        type: "openai-compatible",
        baseUrl: "https://other.example.com/secret-path",
        secret: keyName,
      });
      const resolve = workspaceModelResolver({
        workspace,
        secrets,
        http,
        isTrusted: () => true,
        keyOrigins: originsOf({ [keyName]: [gateway] }),
      });

      const error = await resolve(call).then(
        () => new Error("resolved"),
        (e: unknown) => e as Error,
      );

      expect(error.message).toContain(
        `Provider "main" can't send key "${keyName}" to https://other.example.com.`,
      );
      expect(error.message).not.toContain("fake-key-value");
      expect(error.message).not.toContain("secret-path");
    });

    it("words the error with the key's name and a command that is right to paste", async () => {
      const resolveFor = async (baseUrl: string) => {
        const workspace = await workspaceOf({
          type: "openai-compatible",
          baseUrl,
          secret: keyName,
        });
        const resolve = workspaceModelResolver({
          workspace,
          secrets,
          http,
          isTrusted: () => true,
          keyOrigins: originsOf({ [keyName]: [gateway] }),
        });
        return await resolve(call).then(
          () => new KindedError("internal", "resolved"),
          (e: unknown) => e as KindedError,
        );
      };

      const plain = await resolveFor("https://other.example.com/v1");
      expect(plain.fix).toBe(
        `To allow it, open Models in Halonic Studio, or run: halonic models allow-address "${keyName}" https://other.example.com`,
      );
      const bracketed = await resolveFor("https://[2001:db8::1]:8443/v1");
      expect(bracketed.fix).toContain(`"${keyName}" "https://[2001:db8::1]:8443"`);
      for (const text of [plain.message, plain.fix ?? ""]) {
        expect(text).not.toContain("fake-key-value");
        expect(text).not.toMatch(/\b(origin|host|url)\b/iu);
      }
    });

    it("is checked for a fallback model too", async () => {
      const workspace = await workspaceOf({
        type: "openai-compatible",
        baseUrl: `${gateway}/v1`,
        secret: keyName,
        fallback: {
          type: "openai-compatible",
          baseUrl: "https://other.example.com/v1",
          secret: "backup-key-name",
        },
      });
      const resolve = workspaceModelResolver({
        workspace,
        secrets,
        http,
        isTrusted: () => true,
        keyOrigins: originsOf({ [keyName]: [gateway], "backup-key-name": [gateway] }),
      });

      await expect(resolve({ ...call, alias: "smart" })).rejects.toMatchObject({
        code: "key-origin-not-allowed",
        message: expect.stringContaining('Provider "backup"'),
      });
    });

    it("is checked for the agent editor's unsaved settings too", async () => {
      const workspace = await workspaceOf({ type: "openai", secret: keyName });
      const resolve = workspaceModelResolver({
        workspace,
        secrets,
        http,
        isTrusted: () => true,
        keyOrigins: originsOf({ [keyName]: [gateway] }),
      });
      const unsaved = (baseUrl: string): ChatTurnRequest => ({
        ...call,
        agent: { type: "openai-compatible", model: "m", local: false, secret: keyName, baseUrl },
      });

      await expect(resolve(unsaved(`${gateway}/v1`))).resolves.toMatchObject({ secret: keyName });
      await expect(resolve(unsaved("https://other.example.com/v1"))).rejects.toMatchObject({
        code: "key-origin-not-allowed",
      });
    });

    it("fails the call when the list can't be read", async () => {
      const workspace = await workspaceOf({
        type: "openai-compatible",
        baseUrl: `${gateway}/v1`,
        secret: keyName,
      });
      const resolve = workspaceModelResolver({
        workspace,
        secrets,
        http,
        isTrusted: () => true,
        keyOrigins: {
          allowedOrigins: async () => {
            throw new Error("The secrets file can't be read.");
          },
        },
      });

      await expect(resolve(call)).rejects.toThrow("can't be read");
    });
  });

  describe("a key with no allowed origins", () => {
    it("keeps the trust rule: refused off its type's address when untrusted, free when trusted", async () => {
      const workspace = await workspaceOf({
        type: "openai-compatible",
        baseUrl: `${gateway}/v1`,
        secret: keyName,
      });
      const resolve = (trusted: boolean) =>
        workspaceModelResolver({
          workspace,
          secrets,
          http,
          isTrusted: () => trusted,
          keyOrigins: originsOf({ "another-key-name": [gateway] }),
        });

      await expect(resolve(false)(call)).rejects.toMatchObject({
        code: "untrusted-provider-address",
      });
      await expect(resolve(true)(call)).resolves.toMatchObject({ secret: keyName });
    });

    it("is not asked about for a provider with no stored key, or the mock model", async () => {
      const origins = originsOf({});
      for (const provider of [
        { type: "openai-compatible", baseUrl: `${gateway}/v1` },
        { type: "mock", secret: keyName },
      ]) {
        const resolve = workspaceModelResolver({
          workspace: await workspaceOf(provider),
          secrets,
          http,
          isTrusted: () => true,
          keyOrigins: origins,
        });
        await expect(resolve(call)).resolves.toBeDefined();
      }
      expect(origins.asked).toEqual([]);
    });
  });
});

verifies("cli.key-origin-ask", () => {
  it("gives the provider, the key's name and the address as the refusal's detail, never the key's value", async () => {
    const workspace = await workspaceOf({ type: "openai", secret: keyName });
    const resolve = workspaceModelResolver({
      workspace,
      secrets,
      http,
      isTrusted: () => true,
      keyOrigins: originsOf({ [keyName]: ["https://gateway.example.com"] }),
    });

    const failure = await resolve(call).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      failureCause: {
        code: "models.key-origin-not-allowed",
        detail: { provider: "main", key: keyName, origin: "https://api.openai.com" },
      },
    });
    expect(JSON.stringify(failure)).not.toContain("fake-key-value");
  });
});
