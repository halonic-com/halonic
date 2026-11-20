import { errorKindOf, KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type AccessProviderFile, providerAccessOf } from "./provider-access.ts";

const claude: AccessProviderFile = { id: "claude", type: "anthropic", secret: "anthropic-key" };
const backup: AccessProviderFile = { id: "backup", type: "anthropic", secret: "backup-key" };
const gpt: AccessProviderFile = { id: "gpt", type: "openai", secret: "openai-key" };
const keyless: AccessProviderFile = { id: "keyless", type: "anthropic" };

verifies("harness-host.provider-access", () => {
  describe("an agent on this computer", () => {
    it("keeps the program's own sign-in, even with a keyed provider", () => {
      expect(
        providerAccessOf({ harness: "claude-code", runsOn: "this-computer", providers: [claude] }),
      ).toEqual({ kind: "sign-in", provider: "anthropic", reason: "this-computer" });
    });
  });

  describe("an agent in the sandbox", () => {
    it("gets the key of the only provider of its harness's type with a secret", () => {
      expect(
        providerAccessOf({
          harness: "claude-code",
          runsOn: "sandbox",
          providers: [keyless, gpt, claude],
        }),
      ).toEqual({
        kind: "key",
        provider: "anthropic",
        providerId: "claude",
        secret: "anthropic-key",
      });
    });

    it("gets the key of the provider its model points to, out of several", () => {
      expect(
        providerAccessOf({
          harness: "claude-code",
          runsOn: "sandbox",
          providers: [claude, backup],
          modelProvider: "backup",
        }),
      ).toMatchObject({ kind: "key", providerId: "backup", secret: "backup-key" });
    });

    it("keeps the provider file's baseUrl, so the key goes only there", () => {
      const zai = { ...claude, id: "zai", baseUrl: "https://api.z.ai/api/anthropic" };

      expect(
        providerAccessOf({ harness: "claude-code", runsOn: "sandbox", providers: [zai] }),
      ).toMatchObject({
        kind: "key",
        providerId: "zai",
        baseUrl: "https://api.z.ai/api/anthropic",
      });
    });

    it("gives Codex the OpenAI provider's key", () => {
      expect(
        providerAccessOf({ harness: "codex", runsOn: "sandbox", providers: [claude, gpt] }),
      ).toMatchObject({ kind: "key", provider: "openai", providerId: "gpt", secret: "openai-key" });
    });

    it("stops, naming them, when several could pay and the model points to none", () => {
      const choose = () =>
        providerAccessOf({
          harness: "claude-code",
          runsOn: "sandbox",
          providers: [claude, backup],
          modelProvider: "gpt",
        });

      expect(choose).toThrow(KindedError);
      expect(choose).toThrow(/several Anthropic providers with a key \(claude, backup\)/u);
      try {
        choose();
      } catch (error) {
        expect(errorKindOf(error)).toBe("invalid_input");
      }
    });

    it("stops, rather than spend another provider's key, when its model points to one with no secret", () => {
      const choose = () =>
        providerAccessOf({
          harness: "claude-code",
          runsOn: "sandbox",
          providers: [keyless, claude],
          modelProvider: "keyless",
        });

      expect(choose).toThrow(KindedError);
      expect(choose).toThrow(/provider "keyless", which names no secret/u);
      try {
        choose();
      } catch (error) {
        expect(errorKindOf(error)).toBe("invalid_input");
      }
    });

    it("keeps the program's own sign-in when no provider of its type has a secret", () => {
      expect(
        providerAccessOf({ harness: "claude-code", runsOn: "sandbox", providers: [keyless, gpt] }),
      ).toEqual({ kind: "sign-in", provider: "anthropic", reason: "no-keyed-provider" });
    });
  });
});
