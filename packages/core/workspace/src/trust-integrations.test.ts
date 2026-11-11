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
  provides?: readonly string[];
  needs?: readonly string[];
  googleScopes?: readonly unknown[];
}

/** A parsed permission sheet with these parts. */
function sheet(id: string, parts: SheetParts): IntegrationSheet {
  const { hosts, secrets = {}, tools = [], provides = ["connector"], needs = [] } = parts;
  // Built as data, so the test doesn't depend on the sheet's other fields.
  const data = { id, version: "1.0.0", kit: 1, provides, hosts, secrets, tools, needs };
  const google = parts.googleScopes === undefined ? {} : { googleScopes: parts.googleScopes };
  return { ...data, ...google, tokens: [] } as unknown as IntegrationSheet;
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

/** `homeParts` with its one tool changed. */
function withTool(changes: Record<string, unknown>): SheetParts {
  return { ...homeParts, tools: [{ ...(homeParts.tools?.[0] as object), ...changes }] };
}

/** `homeParts` with a Google scope, as a sheet with the `google-account` secret has it. */
function withScope(scope: string, reason = "Reads your mail"): SheetParts {
  return { ...homeParts, googleScopes: [{ scope, reason }] };
}

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
    it("lists the folder, what it provides, the hosts with their class, the secrets by name, the scopes, the tools, the needs, the code and the setting's URL", () => {
      expect(contentOf([homeStation({ url: "HTTP://192.168.1.20:8123" })]).integrations).toEqual([
        {
          id: "home-station",
          folder: "integrations/home-station",
          provides: ["connector"],
          hosts: { "api.example.com": "public", "‹setting url›": "private" },
          secrets: [
            {
              secret: "‹secret station-key›",
              hosts: ["‹setting url›"],
              placement: { as: "header", header: "X-Station-Key", prefix: "Key " },
              optional: false,
            },
          ],
          googleScopes: [],
          tools: { "read-sensors": { risk: "read", untrusted: false } },
          needs: [],
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

    it("lists each Google scope without its reason, and what it needs, sorted", () => {
      const parts: SheetParts = {
        ...homeParts,
        provides: ["knowledge", "connector"],
        needs: ["process"],
        googleScopes: [
          { scope: "https://www.googleapis.com/auth/gmail.readonly", reason: "Reads your mail" },
          { scope: "email", reason: "Shows which account is signed in" },
        ],
      };
      expect(contentOf([homeStation({}, parts)]).integrations?.[0]).toMatchObject({
        provides: ["connector", "knowledge"],
        googleScopes: ["email", "https://www.googleapis.com/auth/gmail.readonly"],
        needs: ["process"],
      });
    });

    it.each([
      "integrations/home-station/",
      "integrations//home-station/.",
      "./integrations/home-station",
    ])("writes the folder %j without a trailing slash", (folder) => {
      const integration = { ...homeStation({}), folder };
      expect(contentOf([integration]).integrations?.[0]?.folder).toBe("integrations/home-station");
    });

    it.each([
      "/srv/integrations/home-station",
      "../home-station",
      "integrations/../..",
      ".",
      "",
      "integrations\\home-station",
      "C:/integrations/home-station",
      "integrations/home-station.",
    ])("refuses the folder %j, which isn't inside the workspace", (folder) => {
      expect(() => contentOf([{ ...homeStation({}), folder }])).toThrow(RangeError);
    });

    it("refuses two integrations with the same id, which the changes couldn't tell apart", () => {
      const copy = { ...homeStation({}), folder: "integrations/copy" };
      expect(() => contentOf([homeStation({}), copy])).toThrow(
        'Two local integrations have the id "home-station".',
      );
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
      ["a tool's risk", withTool({ risk: "write" }), ["tools"]],
      ["whether a tool's result is outside content", withTool({ untrusted: true }), ["tools"]],
      ["what it provides", { ...homeParts, provides: ["llm"] }, ["provides"]],
      ["what it needs", { ...homeParts, needs: ["process"] }, ["needs"]],
      [
        "a Google scope",
        withScope("https://www.googleapis.com/auth/gmail.modify"),
        ["googleScopes"],
      ],
    ])("changes when %s changes", async (_, parts, fields) => {
      await expectChange([homeStation({ url: "http://192.168.1.20:8123" }, parts)], fields);
    });

    it("changes when the folder moves", async () => {
      const moved = { ...homeStation({ url: "http://192.168.1.20:8123" }), folder: "tools/home" };
      await expectChange([moved], ["folder"]);
    });

    // In a real folder `integration.yaml` is one of the files, so any edit to
    // the sheet changes `code` too. `withSheetFile` stands for that edit.
    async function withSheetFile(text: string): Promise<string> {
      return integrationCodeDigest(
        [
          { path: "index.js", bytes: encodeUtf8("export default {};\n") },
          { path: "integration.yaml", bytes: encodeUtf8(text) },
        ],
        digest,
      );
    }

    it("shows a change to a field of the sheet as that field and code", async () => {
      const parts = { ...homeParts, needs: ["process"] };
      const code = await withSheetFile("needs: [process]\n");
      await expectChange(
        [homeStation({ url: "http://192.168.1.20:8123" }, parts, code)],
        ["code", "needs"],
      );
    });

    it.each([
      ["a tool's description", withTool({ description: "Reads every sensor" })],
      ["a tool's noun", withTool({ noun: { one: "sensor", many: "sensors" } })],
    ])("shows a change to %s as code only", async (_, reworded) => {
      const code = await withSheetFile("description: Reads every sensor\n");
      await expectChange(
        [homeStation({ url: "http://192.168.1.20:8123" }, reworded, code)],
        ["code"],
      );
    });

    it("shows a change to a Google scope's reason as code only", async () => {
      const scope = "https://www.googleapis.com/auth/gmail.readonly";
      const before = [homeStation({}, withScope(scope))];
      const code = await withSheetFile("reason: Reads your mail to sort it\n");
      const after = [homeStation({}, withScope(scope, "Reads your mail to sort it"), code)];
      const changes = trustChanges(contentOf(before), contentOf(after));
      expect(changes.integrations.changed.map((change) => change.fields)).toEqual([["code"]]);
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
