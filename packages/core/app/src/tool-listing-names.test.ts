// The final names `readToolListing` gives listed tools: the source's id,
// `__`, then the name the server listed.

import type { ConnectorTool, IntegrationTool, TrustGrant } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { listedToolName, readToolListing, type ToolListingInput } from "./tool-listing.ts";

function tool(name: string): ConnectorTool {
  return { name, description: `Runs ${name}.`, parameters: { type: "object" } };
}

function read(source: string, listed: ConnectorTool[], overrides: Partial<ToolListingInput> = {}) {
  return readToolListing({
    source,
    listed,
    declared: [],
    otherNames: new Set(),
    trust: null,
    ...overrides,
  });
}

const search: IntegrationTool = {
  name: "search",
  description: "Searches the notes.",
  parameters: { type: "object" },
  risk: "read",
};

const grant: TrustGrant = { location: "/work/notes", fingerprint: "hfp1:0000" };

verifies("ports.untrusted-tool-listings", () => {
  it("puts the source's id in front of a listed name, keeps the listed name, and leaves declared names alone", () => {
    const { tools } = read("notes", [tool("search"), tool("lookup")], { declared: [search] });
    expect(tools.map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "declared search",
      "listed notes__lookup",
    ]);
    expect(tools[1]).toMatchObject({ name: "notes__lookup", listedName: "lookup" });
  });

  it("refuses the second of two final names that meet across sources, with its listed name", () => {
    const first = read("a", [tool("b__c")]);
    expect(first.tools.map(({ name }) => name)).toEqual(["a__b__c"]);

    const otherNames = new Set(first.tools.map(({ name }) => name));
    const second = read("a__b", [tool("c")], { otherNames });
    expect(second.tools).toEqual([]);
    expect(second.refusals).toEqual([
      {
        source: "a__b",
        name: "c",
        refused: "tool",
        reason: "another tool offered to the model has this name",
      },
    ]);
  });

  it.each([
    ["the declared name first", ["notes__lookup", "lookup"]],
    ["the listed name first", ["lookup", "notes__lookup"]],
  ])(
    "refuses a listed tool whose final name is one of the source's declared names, with %s",
    (_order, names) => {
      const declaredLookup: IntegrationTool = { ...search, name: "notes__lookup" };
      const { tools, refusals } = read("notes", names.map(tool), { declared: [declaredLookup] });
      expect(tools.map(({ kind, name }) => `${kind} ${name}`)).toEqual(["declared notes__lookup"]);
      expect(refusals).toEqual([
        {
          source: "notes",
          name: "lookup",
          refused: "tool",
          reason: "a tool this source declares has this name",
        },
      ]);
    },
  );

  it("refuses a listed name that fits alone but not with the source's id in front, without cutting it", () => {
    const sixty = "n".repeat(60);
    const fits = "n".repeat(57);
    const { tools, refusals } = read("notes", [tool(sixty), tool(fits)]);
    expect(tools.map(({ name }) => name)).toEqual([`notes__${fits}`]);
    expect(refusals).toEqual([
      {
        source: "notes",
        name: sixty,
        refused: "tool",
        reason: "its name breaks the name rule once the source's id is in front",
      },
    ]);
  });

  it("counts the final name toward the 2,048-character cap", () => {
    // 32 × 63 + 28 = 2,044 characters of `required` strings, and `s__n` makes 2,048.
    const required = Array.from({ length: 32 }, () => "w".repeat(63));
    const withLast = (last: string): ConnectorTool => ({
      ...tool("n"),
      parameters: { type: "object", required: [...required, last] },
    });
    expect(read("s", [withLast("w".repeat(28))]).tools).toHaveLength(1);
    // Without the prefix, 2,045 + 1 would still fit; with it, it's 2,049.
    expect(read("s", [withLast("w".repeat(29))]).tools).toEqual([]);
  });

  it("keys the risk a trusted workspace sets by the listed name", () => {
    const { tools } = read("notes", [tool("lookup")], {
      trust: grant,
      workspaceRisks: new Map([["lookup", "read"]]),
    });
    expect(tools[0]).toMatchObject({ name: "notes__lookup", risk: "read" });
  });

  it("builds a final name from the source's id and the listed name", () => {
    expect(listedToolName("notes", "lookup")).toBe("notes__lookup");
    expect(listedToolName("a__b", "c")).toBe(listedToolName("a", "b__c"));
  });
});
