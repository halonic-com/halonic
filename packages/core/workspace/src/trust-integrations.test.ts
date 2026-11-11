import type { IntegrationSheet } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { trustChanges } from "./trust-changes.ts";
import { trustContent } from "./trust-content.ts";
import { trustFingerprint } from "./trust-fingerprint.ts";
import { integrationCodeDigest } from "./trust-integration-code.ts";
import type { LocalIntegrationInput } from "./trust-integrations.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

interface SheetParts {
  hosts: readonly unknown[];
  secrets?: Record<string, unknown>;
  tools?: readonly unknown[];
}

/** A parsed permission sheet with these hosts, secrets and tools. */
function sheet(id: string, { hosts, secrets = {}, tools = [] }: SheetParts): IntegrationSheet {
  // Built as data, so the test doesn't depend on the sheet's other fields.
  const data = { id, version: "1.0.0", kit: 1, provides: ["connector"], hosts, secrets, tools };
  return { ...data, tokens: [], needs: [] } as unknown as IntegrationSheet;
}

const homeParts: SheetParts = {
  hosts: ["api.example.com", { fromSetting: "url", class: "private" }],
  secrets: {
    "station-key": {
      purpose: "Reads the station",
      hosts: [{ fromSetting: "url" }],
      optional: false,
      as: "header",
      header: "X-Station-Key",
      prefix: "Key ",
    },
  },
  tools: [
    { name: "read-sensors", description: "Reads the sensors", risk: "read", untrusted: false },
  ],
};

const homeCode = await integrationCodeDigest(
  [{ path: "index.js", bytes: encodeUtf8("export default {};\n") }],
  digest,
);

function homeStation(
  settings: Record<string, unknown>,
  parts: SheetParts = homeParts,
  code = homeCode,
): LocalIntegrationInput {
  return {
    sheet: sheet("home-station", parts),
    settings,
    folder: "integrations/home-station/",
    code,
  };
}

function contentOf(integrations: LocalIntegrationInput[]) {
  return trustContent({ connectors: [], integrations });
}

function fingerprintOf(integrations: LocalIntegrationInput[]): Promise<string> {
  return trustFingerprint(contentOf(integrations), digest);
}

verifies("workspace.trust-integrations", () => {
  describe("the content", () => {
    it("lists the folder, the hosts with their class, the secrets by name, the tool risks, the code and the setting's URL", () => {
      expect(contentOf([homeStation({ url: "HTTP://192.168.1.20:8123" })]).integrations).toEqual([
        {
          id: "home-station",
          folder: "integrations/home-station/",
          hosts: { "api.example.com": "public", "‹setting url›": "private" },
          secrets: [
            {
              secret: "‹secret station-key›",
              hosts: ["‹setting url›"],
              placement: { as: "header", header: "X-Station-Key", prefix: "Key " },
              optional: false,
            },
          ],
          tools: { "read-sensors": "read" },
          code: homeCode,
          addresses: { url: "http://192.168.1.20:8123/" },
        },
      ]);
    });

    it.each([{}, { url: "" }])("lists a setting that isn't set as null: %j", (settings) => {
      expect(contentOf([homeStation(settings)]).integrations?.[0]?.addresses).toEqual({
        url: null,
      });
    });

    it("keeps only the reason for a URL with a password in it", () => {
      const content = contentOf([homeStation({ url: "https://ops:pw@nas.example.com/" })]);
      expect(content.integrations?.[0]?.addresses).toEqual({
        url: "‹refused: the URL has user info›",
      });
      expect(JSON.stringify(content)).not.toContain("pw@");
    });

    it("adds an integration with fixed hosts only, with no addresses", () => {
      const weather = homeStation({}, { hosts: ["api.example.com"] });
      expect(contentOf([weather]).integrations?.[0]).toMatchObject({
        hosts: { "api.example.com": "public" },
        addresses: {},
      });
    });

    it("leaves the content as it was for a workspace without local integrations", async () => {
      expect(contentOf([])).toEqual({ connectors: [] });
      expect(await fingerprintOf([])).toBe(
        await trustFingerprint(trustContent({ connectors: [] }), digest),
      );
    });

    it("sorts integrations by id and their settings by name", () => {
      const alpha: LocalIntegrationInput = {
        sheet: sheet("alpha", {
          hosts: [
            { fromSetting: "b", class: "public" },
            { fromSetting: "a", class: "public" },
          ],
        }),
        settings: { a: "https://a.example.com", b: "https://b.example.com" },
        folder: "integrations/alpha",
        code: homeCode,
      };
      const content = contentOf([homeStation({ url: "http://10.0.0.1" }), alpha]);
      expect(content.integrations?.map((item) => item.id)).toEqual(["alpha", "home-station"]);
      expect(Object.keys(content.integrations?.[0]?.addresses ?? {})).toEqual(["a", "b"]);
    });
  });

  describe("the fingerprint and the changes", () => {
    const trusted = [homeStation({ url: "http://192.168.1.20:8123" })];

    async function expectChange(current: LocalIntegrationInput[], fields: string[]) {
      expect(await fingerprintOf(current)).not.toBe(await fingerprintOf(trusted));
      const changes = trustChanges(contentOf(trusted), contentOf(current));
      expect(changes.integrations.changed.map((change) => change.fields)).toEqual([fields]);
      expect(changes.onlyRemoves).toBe(false);
    }

    it.each([
      ["changes", { url: "http://192.168.1.21:8123" }],
      ["is cleared", {}],
    ])("changes when the setting %s, and lists it as changed", async (_, settings) => {
      await expectChange([homeStation(settings)], ["addresses"]);
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

    it("changes when one byte of a file changes, and shows it as a change in code only", async () => {
      const code = await integrationCodeDigest(
        [{ path: "index.js", bytes: encodeUtf8("export default {};\r") }],
        digest,
      );
      await expectChange(
        [homeStation({ url: "http://192.168.1.20:8123" }, homeParts, code)],
        ["code"],
      );
    });

    it.each([
      [
        "a fixed address",
        { ...homeParts, hosts: ["api2.example.com", { fromSetting: "url", class: "private" }] },
        ["hosts"],
      ],
      [
        "the class of an address",
        { ...homeParts, hosts: ["api.example.com", { fromSetting: "url", class: "public" }] },
        ["hosts"],
      ],
      [
        "a secret's name",
        { ...homeParts, secrets: { "station-token": homeParts.secrets?.["station-key"] } },
        ["secrets"],
      ],
      [
        "where a secret may go",
        {
          ...homeParts,
          secrets: {
            "station-key": {
              ...(homeParts.secrets?.["station-key"] as object),
              hosts: ["api.example.com"],
            },
          },
        },
        ["secrets"],
      ],
      [
        "a tool's risk",
        {
          ...homeParts,
          tools: [
            {
              name: "read-sensors",
              description: "Reads the sensors",
              risk: "write",
              untrusted: false,
            },
          ],
        },
        ["tools"],
      ],
    ])("changes when %s changes", async (_, parts, fields) => {
      await expectChange([homeStation({ url: "http://192.168.1.20:8123" }, parts)], fields);
    });

    it("changes when the folder moves", async () => {
      const moved = { ...homeStation({ url: "http://192.168.1.20:8123" }), folder: "tools/home" };
      await expectChange([moved], ["folder"]);
    });

    it("stays the same when only the wording of the sheet changes", async () => {
      const reworded = {
        ...homeParts,
        tools: [
          {
            name: "read-sensors",
            description: "Reads every sensor",
            risk: "read",
            untrusted: false,
          },
        ],
      };
      const same = [homeStation({ url: "http://192.168.1.20:8123" }, reworded)];
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
