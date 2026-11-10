import { readFileSync } from "node:fs";
import { join } from "node:path";
import { integrationVersion, type SecretPlacement } from "@halonicjs/ports";
import { expectSpecFile, verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { jsonSchemaOf, type SpecName, specId, specNames } from "./spec.ts";

function specPath(spec: SpecName): string {
  return join(import.meta.dirname, "..", "spec", `${spec}.schema.json`);
}

verifies("integration-kit.spec-files", () => {
  it.each(specNames)("matches the spec file for %s", (spec) => {
    expectSpecFile(specPath(spec), jsonSchemaOf(spec));
  });

  it.each(specNames)("names the interface version in the $id of %s", (spec) => {
    const file = JSON.parse(readFileSync(specPath(spec), "utf8")) as Record<string, unknown>;
    expect(file["$id"]).toBe(specId(spec));
    expect(String(file["$id"])).toMatch(
      new RegExp(`/${spec}/v${integrationVersion}\\.schema\\.json$`),
    );
  });

  it("requires name, version and tools, and a risk on each tool", () => {
    const schema = jsonSchemaOf("integration");
    expect(schema["required"]).toEqual(["name", "version", "tools"]);
    const tools = (schema["properties"] as Record<string, { items: Record<string, unknown> }>)[
      "tools"
    ];
    expect(tools?.items["required"]).toContain("risk");
  });

  it("offers the bearer, header and form placements", () => {
    const placements = jsonSchemaOf("secret-placement")["oneOf"] as {
      properties: { as: { const: SecretPlacement["as"] } };
    }[];
    expect(placements.map((placement) => placement.properties.as.const)).toEqual([
      "bearer",
      "header",
      "form",
    ]);
  });
});
