import type { Provider } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { trustChanges } from "./trust-changes.ts";
import { trustContent } from "./trust-content.ts";
import { trustFingerprint } from "./trust-fingerprint.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** A model provider as parsed from its file, with the defaults filled in. */
function provider(fields: Partial<Provider> = {}): Provider {
  return {
    version: 1,
    id: "claude",
    type: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    secret: "anthropic-key",
    local: false,
    options: {},
    ...fields,
  };
}

function fingerprintOf(providers: Provider[]): Promise<string> {
  return trustFingerprint(trustContent({ connectors: [], providers }), digest);
}

verifies("workspace.trust-providers", () => {
  describe("a model provider", () => {
    it("holds its type, its address normalised, its secret by name, local and its options", () => {
      const content = trustContent({
        connectors: [],
        providers: [
          provider({
            name: "Claude",
            baseUrl: "HTTPS://API.Anthropic.com:443/v1",
            options: { apiVersion: "2023-06-01" },
          }),
        ],
      });
      expect(content.providers).toEqual([
        {
          id: "claude",
          type: "anthropic",
          baseUrl: "https://api.anthropic.com/v1",
          secret: "‹secret anthropic-key›",
          local: false,
          options: { apiVersion: "2023-06-01" },
        },
      ]);
    });

    it("changes the fingerprint when its address, secret, type, local or options change", async () => {
      const trusted = await fingerprintOf([provider()]);
      const changes: Partial<Provider>[] = [
        { baseUrl: "https://models.example.net/v1" },
        { baseUrl: "https://api.anthropic.com/v2" },
        { baseUrl: undefined },
        { secret: "other-key" },
        { secret: undefined },
        { type: "openai-compatible" },
        { local: true },
        { options: { headers: { "x-route": "b" } } },
      ];
      for (const change of changes) {
        expect(await fingerprintOf([provider(change)])).not.toBe(trusted);
      }
    });

    it("asks again when its address changes, as a change and not a removal", () => {
      const before = trustContent({ connectors: [], providers: [provider()] });
      const after = trustContent({
        connectors: [],
        providers: [provider({ baseUrl: "https://models.example.net/v1" })],
      });
      const changes = trustChanges(before, after);
      expect(changes.providers.changed.map((change) => change.fields)).toEqual([["baseUrl"]]);
      expect(changes.onlyRemoves).toBe(false);
    });

    it("keeps the fingerprint when only its name, the order or the way its host is written changes", async () => {
      const other = provider({ id: "local", type: "ollama", baseUrl: "http://localhost:11434/v1" });
      const trusted = await fingerprintOf([provider(), other]);
      expect(await fingerprintOf([other, provider({ name: "Claude" })])).toBe(trusted);
      expect(
        await fingerprintOf([provider({ baseUrl: "https://API.anthropic.com/v1" }), other]),
      ).toBe(trusted);
    });

    it("refuses an address with user info or a backslash, without the address, and has no fingerprint", async () => {
      const content = trustContent({
        connectors: [],
        providers: [
          provider({ id: "a", baseUrl: "https://ops:pw@api.anthropic.com/v1" }),
          provider({ id: "b", baseUrl: "https://evil.test\\@api.anthropic.com/v1" }),
        ],
      });
      expect(content.refused?.map((refused) => refused.id)).toEqual(["a", "b"]);
      expect(content.providers).toBeUndefined();
      expect(JSON.stringify(content)).not.toContain("pw");
      await expect(trustFingerprint(content, digest)).rejects.toThrow(RangeError);
    });
  });

  describe("the test model", () => {
    it("adds nothing, so a workspace with only it has the same content as one without providers", async () => {
      const mock = provider({ id: "mock", type: "mock", baseUrl: undefined, secret: undefined });
      expect(trustContent({ connectors: [], providers: [mock] })).toEqual({ connectors: [] });
      expect(await fingerprintOf([mock])).toBe(await fingerprintOf([]));
    });
  });
});
