import type { IntegrationSheet } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { trustChanges } from "./trust-changes.ts";
import { trustContent } from "./trust-content.ts";
import { trustFingerprint } from "./trust-fingerprint.ts";
import type { LocalIntegrationInput } from "./trust-integrations.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** A parsed permission sheet with these hosts. */
function sheet(id: string, hosts: readonly unknown[]): IntegrationSheet {
  // Built as data, so the test doesn't depend on which fields a
  // `{ fromSetting }` host has besides its setting.
  const data = { id, version: "1.0.0", kit: 1, provides: ["connector"], hosts, secrets: {} };
  return { ...data, tokens: [], tools: [], needs: [] } as unknown as IntegrationSheet;
}

const homeSheet = sheet("home-station", [
  "api.example.com",
  { fromSetting: "url", class: "private" },
]);

function homeStation(settings: Record<string, unknown>): LocalIntegrationInput {
  return { sheet: homeSheet, settings };
}

const fixedOnly: LocalIntegrationInput = {
  sheet: sheet("weather", ["api.example.com"]),
  settings: {},
};

function contentOf(integrations: LocalIntegrationInput[]) {
  return trustContent({ connectors: [], integrations });
}

function fingerprintOf(integrations: LocalIntegrationInput[]): Promise<string> {
  return trustFingerprint(contentOf(integrations), digest);
}

verifies("workspace.trust-integrations", () => {
  describe("the content", () => {
    it("lists the setting's URL, normalised, by setting name", () => {
      expect(contentOf([homeStation({ url: "HTTP://192.168.1.20:8123" })]).integrations).toEqual([
        { id: "home-station", addresses: { url: "http://192.168.1.20:8123/" } },
      ]);
    });

    it.each([{}, { url: "" }])("lists a setting that isn't set as null: %j", (settings) => {
      expect(contentOf([homeStation(settings)]).integrations).toEqual([
        { id: "home-station", addresses: { url: null } },
      ]);
    });

    it("keeps only the reason for a URL with a password in it", () => {
      const content = contentOf([homeStation({ url: "https://ops:pw@nas.example.com/" })]);
      expect(content.integrations).toEqual([
        { id: "home-station", addresses: { url: "‹refused: the URL has user info›" } },
      ]);
      expect(JSON.stringify(content)).not.toContain("pw@");
    });

    it("adds nothing for integrations with fixed hosts only", async () => {
      expect(contentOf([fixedOnly])).toEqual({ connectors: [] });
      expect(await fingerprintOf([fixedOnly])).toBe(await fingerprintOf([]));
    });

    it("sorts integrations by id and their settings by name", () => {
      const two = sheet("alpha", [{ fromSetting: "b" }, { fromSetting: "a" }]);
      const content = contentOf([
        homeStation({ url: "http://10.0.0.1" }),
        { sheet: two, settings: { a: "https://a.example.com", b: "https://b.example.com" } },
      ]);
      expect(content.integrations?.map((item) => item.id)).toEqual(["alpha", "home-station"]);
      expect(Object.keys(content.integrations?.[0]?.addresses ?? {})).toEqual(["a", "b"]);
    });
  });

  describe("the fingerprint and the changes", () => {
    const trusted = [homeStation({ url: "http://192.168.1.20:8123" })];

    it.each([
      ["changes", { url: "http://192.168.1.21:8123" }],
      ["is cleared", {}],
    ])("changes when the setting %s, and lists it as changed", async (_, settings) => {
      const current = [homeStation(settings)];
      expect(await fingerprintOf(current)).not.toBe(await fingerprintOf(trusted));
      const changes = trustChanges(contentOf(trusted), contentOf(current));
      expect(changes.integrations.changed.map(({ id, fields }) => ({ id, fields }))).toEqual([
        { id: "home-station", fields: ["addresses"] },
      ]);
      expect(changes.onlyRemoves).toBe(false);
    });

    it("changes when the setting is set for the first time", async () => {
      const unset = [homeStation({})];
      expect(await fingerprintOf(trusted)).not.toBe(await fingerprintOf(unset));
      expect(trustChanges(contentOf(unset), contentOf(trusted)).integrations.changed).toHaveLength(
        1,
      );
    });

    it("stays the same for the same URL written another way", async () => {
      const same = [homeStation({ url: "HTTP://192.168.1.20:8123/" })];
      expect(await fingerprintOf(same)).toBe(await fingerprintOf(trusted));
    });

    it("lists a removed integration as removed, which only removes things", () => {
      const changes = trustChanges(contentOf(trusted), contentOf([]));
      expect(changes.integrations.removed.map((item) => item.id)).toEqual(["home-station"]);
      expect(changes.onlyRemoves).toBe(true);
    });

    it("lists it as new against a record from before integrations were in the content", () => {
      const changes = trustChanges({ connectors: [] }, contentOf(trusted));
      expect(changes.integrations.added.map((item) => item.id)).toEqual(["home-station"]);
      expect(changes.onlyRemoves).toBe(false);
    });
  });
});
