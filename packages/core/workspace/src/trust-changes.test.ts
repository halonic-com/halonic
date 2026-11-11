import type { Connector } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { trustChanges } from "./trust-changes.ts";
import { trustContent } from "./trust-content.ts";

type StdioSettings = Extract<Connector["transport"], { stdio: unknown }>["stdio"];

function program(
  id: string,
  settings: Partial<StdioSettings> = {},
  tools: Connector["tools"] = { approve: ["delete_file"] },
): Connector {
  return {
    version: 1,
    id,
    transport: { stdio: { command: "node", args: ["server.js"], cwd: ".", ...settings } },
    tools,
  };
}

/** Compares two workspaces' connectors as the trust gate does. */
function changes(trusted: Connector[], current: Connector[]) {
  return trustChanges(trustContent({ connectors: trusted }), trustContent({ connectors: current }));
}

verifies("workspace.trust-changes", () => {
  describe("whole connectors", () => {
    it("lists a new connector, which isn't only a removal", () => {
      const result = changes([program("files")], [program("files"), program("uploader")]);
      expect(result.added.map((connector) => connector.id)).toEqual(["uploader"]);
      expect(result.unchanged).toBe(1);
      expect(result.onlyRemoves).toBe(false);
    });

    it("lists a removed connector, which only removes things", () => {
      const result = changes([program("files"), program("mail")], [program("files")]);
      expect(result.removed.map((connector) => connector.id)).toEqual(["mail"]);
      expect(result.added).toEqual([]);
      expect(result.changed).toEqual([]);
      expect(result.unchanged).toBe(1);
      expect(result.onlyRemoves).toBe(true);
    });

    it("asks when one connector is removed and another changes", () => {
      const result = changes(
        [program("files"), program("mail")],
        [program("files", { env: { MODE: "fast" } })],
      );
      expect(result.removed.map((connector) => connector.id)).toEqual(["mail"]);
      expect(result.changed.map((change) => change.id)).toEqual(["files"]);
      expect(result.onlyRemoves).toBe(false);
    });

    it("finds nothing when the content is the same", () => {
      const result = changes([program("files")], [program("files")]);
      expect(result).toEqual({
        added: [],
        changed: [],
        removed: [],
        unchanged: 1,
        agents: { added: [], changed: [], removed: [], unchanged: 0 },
        integrations: { added: [], changed: [], removed: [], unchanged: 0 },
        providers: { added: [], changed: [], removed: [], unchanged: 0 },
        onlyRemoves: false,
      });
    });
  });

  describe("inside a connector", () => {
    it("lists an added variable as a change in settings", () => {
      const result = changes(
        [program("files")],
        [program("files", { env: { NODE_OPTIONS: "--require ./x.js" } })],
      );
      expect(result.changed).toHaveLength(1);
      expect(result.changed[0]?.fields).toEqual(["settings"]);
      expect(result.changed[0]?.after.settings["env"]).toEqual({
        NODE_OPTIONS: "--require ./x.js",
      });
    });

    it("never treats taking something out of a connector as a removal", () => {
      const cases: [Connector, Connector][] = [
        [program("files"), program("files", {}, { approve: [] })],
        [
          program("files", {}, { approve: [], allow: ["read_file"] }),
          program("files", {}, { approve: [] }),
        ],
        [program("files", { env: { SAFE_MODE: "1" } }), program("files", { env: {} })],
      ];
      for (const [trusted, current] of cases) {
        const result = changes([trusted], [current]);
        expect(result.changed).toHaveLength(1);
        expect(result.onlyRemoves).toBe(false);
      }
    });

    it("names the tool lists when a tool leaves approve", () => {
      const result = changes([program("files")], [program("files", {}, { approve: [] })]);
      expect(result.changed[0]?.fields).toEqual(["tools"]);
    });
  });
});
