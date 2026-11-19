import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { type KeyOrigins, noKeyOrigins } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type HarnessAccessChecks, harnessModelAccess, harnessProviderModel } from "./index.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-harness-access-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A workspace with the providers given, and an alias for each in `models.yaml`. */
async function workspaceWith(providers: Record<string, string>): Promise<LoadedWorkspace> {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "models.yaml": [
      "aliases:",
      "  open-coder-agent:",
      "    provider: zai",
      "    model: glm-5.3",
      "    price: { input: 0.6, output: 2.2 }",
      "    fallback: [open-coder-fallback]",
      "  open-coder-fallback:",
      "    provider: deepseek",
      "    model: deepseek-v4.1-flash",
      "  routed:",
      "    provider: openrouter",
      "    model: z-ai/glm-5.3",
      "  local:",
      "    provider: ollama",
      "    model: llama3.2",
      "  ghost:",
      "    provider: nowhere",
      "    model: none",
      "",
    ].join("\n"),
  };
  for (const [id, body] of Object.entries(providers)) {
    files[`providers/${id}.yaml`] = `id: ${id}\n${body}`;
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

const zai = "type: anthropic\nbaseUrl: https://api.z.ai/api/anthropic\nsecret: zai-key\n";
const deepseek = "type: anthropic\nbaseUrl: https://api.deepseek.com/anthropic\nsecret: ds-key\n";
const openrouter =
  "type: openai-compatible\nbaseUrl: https://openrouter.ai/api/v1\nsecret: or-key\n";
const ollama = "type: ollama\n";

const trusted: HarnessAccessChecks = { isTrusted: () => true, keyOrigins: noKeyOrigins };
const untrusted: HarnessAccessChecks = { isTrusted: () => false, keyOrigins: noKeyOrigins };

/** Key origins that allow each key only the origins listed for it. */
function listed(origins: Record<string, string[]>): KeyOrigins {
  return { allowedOrigins: async (secret) => origins[secret] };
}

async function errorOf(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  return await promise.then(
    () => {
      throw new Error("expected the access to fail");
    },
    (error: { code?: string; message: string }) => error,
  );
}

verifies("cli.harness-model-access", () => {
  describe("the keyed provider of a harness agent's model alias", () => {
    it("names the route, provider, key, address, model and price of the alias", async () => {
      const workspace = await workspaceWith({ zai, deepseek });

      const access = await harnessModelAccess(workspace, "support", "open-coder-agent", trusted);

      expect(access).toEqual({
        route: "anthropic",
        providerId: "zai",
        secret: "zai-key",
        baseUrl: "https://api.z.ai/api/anthropic",
        model: "glm-5.3",
        price: { input: 0.6, output: 2.2 },
      });
    });

    it("gives an openai-compatible provider the Responses route", async () => {
      const workspace = await workspaceWith({ openrouter });

      const access = await harnessModelAccess(workspace, "support", "routed", trusted);

      expect(access).toMatchObject({ route: "openai", providerId: "openrouter", secret: "or-key" });
      expect(access?.model).toBe("z-ai/glm-5.3");
    });

    it("gives no keyed provider for a name that is no alias, or names a provider directly", async () => {
      const workspace = await workspaceWith({ zai, deepseek });

      expect(await harnessModelAccess(workspace, "support", "sonnet", trusted)).toBeUndefined();
      expect(
        await harnessModelAccess(workspace, "support", "zai/glm-5.3", trusted),
      ).toBeUndefined();
      expect(harnessProviderModel(workspace, "support", "sonnet")).toBeUndefined();
      expect(harnessProviderModel(workspace, "support", "zai/glm-5.3")).toBeUndefined();
    });

    it("maps an alias to its provider's model id, without its fallbacks", async () => {
      const workspace = await workspaceWith({ zai, deepseek });

      expect(harnessProviderModel(workspace, "support", "open-coder-agent")).toBe("glm-5.3");
    });

    it("refuses an address other than the type's own in a workspace that isn't trusted", async () => {
      const workspace = await workspaceWith({ zai, deepseek });

      const error = await errorOf(
        harnessModelAccess(workspace, "support", "open-coder-agent", untrusted),
      );

      expect(error.code).toBe("untrusted-provider-address");
      expect(error.message).toContain("https://api.z.ai");
      expect(error.message).not.toContain("zai-key");
    });

    it("refuses an origin the key's list doesn't allow", async () => {
      const workspace = await workspaceWith({ zai, deepseek });
      const checks = {
        isTrusted: () => true,
        keyOrigins: listed({ "zai-key": ["https://x.example"] }),
      };

      const error = await errorOf(
        harnessModelAccess(workspace, "support", "open-coder-agent", checks),
      );

      expect(error.code).toBe("key-origin-not-allowed");
    });

    it("allows an origin on the key's list", async () => {
      const workspace = await workspaceWith({ zai, deepseek });
      const checks = {
        isTrusted: () => true,
        keyOrigins: listed({ "zai-key": ["https://api.z.ai"] }),
      };

      const access = await harnessModelAccess(workspace, "support", "open-coder-agent", checks);

      expect(access?.providerId).toBe("zai");
    });

    it("refuses a provider type with no bridge route, and a provider with no key", async () => {
      const keyless = "type: anthropic\nbaseUrl: https://api.z.ai/api/anthropic\n";
      const workspace = await workspaceWith({ zai: keyless, deepseek, ollama });

      const local = await errorOf(harnessModelAccess(workspace, "support", "local", trusted));
      const noKey = await errorOf(
        harnessModelAccess(workspace, "support", "open-coder-agent", trusted),
      );

      expect(local.code).toBe("not-for-harness");
      expect(local.message).toContain("ollama");
      expect(noKey.code).toBe("not-for-harness");
      expect(noKey.message).toContain("zai");
    });

    it("refuses an alias whose provider the workspace doesn't have", async () => {
      const workspace = await workspaceWith({ zai, deepseek });

      const error = await errorOf(harnessModelAccess(workspace, "support", "ghost", trusted));

      expect(error.code).toBe("no-provider");
    });
  });
});
