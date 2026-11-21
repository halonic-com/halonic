import type { DefinitionSource } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { readIntegrationSheets } from "./local-integrations.ts";

/** A sheet for the integration `id` that lists `hosts`. */
function sheet(id: string, hosts: string): string {
  return `id: ${id}
version: 0.1.0
kit: 1
provides: [connector]
hosts: ${hosts}
tools:
  - { name: reading, description: The last reading., risk: read, untrusted: true }
`;
}

/** The files of a version of a workspace, by path, as a `VersionSource` gives them. */
function version(files: Readonly<Record<string, string>>): DefinitionSource {
  return {
    location: "memory:acme",
    list: async (dir) =>
      Object.keys(files)
        .filter((path) => dir === undefined || path.startsWith(`${dir}/`))
        .sort(),
    read: async (path) => files[path] ?? null,
    version: async () => "3f2c1ab",
  };
}

describe("readIntegrationSheets", () => {
  it("reads each sheet under integrations/ with its folder, in the order of the folders' names", async () => {
    const sheets = await readIntegrationSheets(
      version({
        "integrations/station/integration.yaml": sheet("station", "[api.station.example]"),
        "integrations/station/index.js": "export {};",
        "integrations/notes/integration.yaml": sheet("notes", "[]"),
      }),
    );

    expect(sheets.map(({ folder, sheet }) => [folder, sheet.id, sheet.hosts])).toEqual([
      ["integrations/notes", "notes", []],
      ["integrations/station", "station", ["api.station.example"]],
    ]);
  });

  it("leaves out a sheet that doesn't parse, one deeper down and a second folder with the same id", async () => {
    const sheets = await readIntegrationSheets(
      version({
        "integrations/broken/integration.yaml": "id: [",
        "integrations/a/integration.yaml": sheet("station", "[]"),
        "integrations/b/integration.yaml": sheet("station", "[api.station.example]"),
        "integrations/a/nested/x/integration.yaml": sheet("nested", "[]"),
        "agents/integration.yaml": sheet("misplaced", "[]"),
      }),
    );

    expect(sheets.map(({ folder }) => folder)).toEqual(["integrations/a"]);
  });

  it("keeps the first folder by name when two share an id, as readLocalIntegrations does", async () => {
    // "integrations/a-b/integration.yaml" sorts before "integrations/a/integration.yaml",
    // but "integrations/a" sorts before "integrations/a-b".
    const sheets = await readIntegrationSheets(
      version({
        "integrations/a/integration.yaml": sheet("station", "[]"),
        "integrations/a-b/integration.yaml": sheet("station", "[api.station.example]"),
        "integrations/a.b/integration.yaml": sheet("station", "[api.station.example]"),
      }),
    );

    expect(sheets.map(({ folder, sheet }) => [folder, sheet.hosts])).toEqual([
      ["integrations/a", []],
    ]);
  });

  it("has no sheets when integrations/ can't be listed, or a sheet can't be read", async () => {
    const unlistable: DefinitionSource = {
      ...version({}),
      list: () => Promise.reject(new Error("unreadable")),
    };
    const unreadable: DefinitionSource = {
      ...version({ "integrations/station/integration.yaml": "" }),
      read: () => Promise.reject(new Error("unreadable")),
    };

    expect(await readIntegrationSheets(unlistable)).toEqual([]);
    expect(await readIntegrationSheets(unreadable)).toEqual([]);
  });
});
