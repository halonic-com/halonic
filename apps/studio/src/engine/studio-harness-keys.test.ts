import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { noKeyOrigins } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeKeychain, acmeWithOpenCoder, zaiAddress } from "./studio-harness-keys.test-helper.ts";
import { type StudioHarnessKeysInput, studioHarnessKeys } from "./studio-harness-keys.ts";

function keysOf(overrides: Partial<StudioHarnessKeysInput> = {}) {
  return studioHarnessKeys({
    definitions: new MemoryDefinitionStore(acmeWithOpenCoder),
    secrets: acmeKeychain,
    keyOrigins: noKeyOrigins,
    isTrusted: async () => true,
    ...overrides,
  });
}

const coder = (model?: string, harness = "claude-code") => ({
  runId: "run_1",
  agentId: "coder",
  harness,
  hubId: "support",
  ...(model === undefined ? {} : { model }),
});

const signIn = { anthropic: { kind: "sign-in" }, openai: { kind: "sign-in" } };

verifies("studio.harness-bridge-keys", () => {
  describe("what a Studio harness agent's bridge reaches", () => {
    it("gives an agent whose model is an alias its provider's key, at its baseUrl, for its model only, with its price", async () => {
      const keys = keysOf();

      const access = await keys.accessOf(coder("open-coder-agent"));

      expect(access).toEqual({
        providers: {
          anthropic: {
            kind: "key",
            secret: "zai-key",
            providerId: "zai",
            baseUrl: zaiAddress,
            models: ["glm-5.3"],
          },
        },
        prices: { anthropic: { "glm-5.3": { input: 0.6, output: 2.2 } } },
      });
      expect(await keys.models.providerModelOf("support", "open-coder-agent")).toBe("glm-5.3");
    });

    it("keeps the program's own sign-in for an agent with no alias", async () => {
      const keys = keysOf();

      expect((await keys.accessOf(coder("sonnet"))).providers).toEqual(signIn);
      expect((await keys.accessOf(coder())).providers).toEqual(signIn);
      expect(await keys.models.providerModelOf("support", "sonnet")).toBeUndefined();
    });

    it("refuses before naming the key when the workspace isn't trusted, as these files", async () => {
      let asked = 0;
      const keys = keysOf({
        isTrusted: async () => {
          asked += 1;
          return false;
        },
      });

      await expect(keys.accessOf(coder("open-coder-agent"))).rejects.toMatchObject({
        kind: "denied",
      });
      expect(asked).toBe(1);
    });

    it("refuses before naming the key when the key's allowed addresses leave out the provider's", async () => {
      const asked: string[] = [];
      const keys = keysOf({
        keyOrigins: {
          allowedOrigins: async (name) => {
            asked.push(name);
            return ["https://open.bigmodel.cn"];
          },
        },
      });

      await expect(keys.accessOf(coder("open-coder-agent"))).rejects.toMatchObject({
        code: "key-origin-not-allowed",
      });
      expect(asked).toEqual(["zai-key"]);
    });

    it("refuses before the program starts an alias whose provider the agent's harness can't call", async () => {
      const keys = keysOf();

      const refusal = await keys
        .accessOf(coder("open-coder-agent", "codex"))
        .catch((error) => error);

      expect(refusal).toMatchObject({ code: "not-for-harness" });
      expect(refusal.message).toMatch(/^Codex can't call provider zai, which has type anthropic/);
    });

    it("never reads a key of Halonic's own or a plugin's", async () => {
      const keys = keysOf();

      await expect(keys.secrets.get("token-key")).rejects.toThrow(RangeError);
      await expect(keys.secrets.get("plugin__weather__acme-key")).rejects.toThrow(RangeError);
      expect(await keys.secrets.get("zai-key")).toBe("fake-zai-key");
    });
  });
});
