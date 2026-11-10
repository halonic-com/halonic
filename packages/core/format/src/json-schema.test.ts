import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expectSpecFile } from "@halonicjs/testing-spec/node";
import { expect, it } from "vitest";
import { jsonSchemaOf, type KindName, kindNames, SCHEMA_VERSION } from "./index.ts";
import { specName } from "./json-schema.ts";

/** Each kind's spec file sits in the package's `spec/` folder: `spec/<kind name in kebab case>.schema.json`. */
function specPath(kind: KindName): string {
  return join(import.meta.dirname, "..", "spec", `${specName(kind)}.schema.json`);
}

/** A kind's committed spec file, as JSON. */
function readSpecFile(kind: KindName): Record<string, unknown> {
  return JSON.parse(readFileSync(specPath(kind), "utf8")) as Record<string, unknown>;
}

/** The `N` in a spec file's `$id` (`…/v<N>.schema.json`), or undefined when it has none. */
function idVersion(spec: Record<string, unknown>): number | undefined {
  const match = /\/v(\d+)\.schema\.json$/.exec(String(spec["$id"]));
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/**
 * The file format version a spec file describes: the `const` of its
 * `version` key. A kind without a `version` key (`skill`, whose file is
 * SKILL.md front matter) falls back to the format's SCHEMA_VERSION.
 */
function kindVersion(spec: Record<string, unknown>): unknown {
  const properties = spec["properties"] as Record<string, { const?: unknown }> | undefined;
  return properties?.["version"]?.const ?? SCHEMA_VERSION;
}

verifies("format.json-schema-goldens", () => {
  it.each(kindNames())("matches the spec file for %s", (kind) => {
    expectSpecFile(specPath(kind), jsonSchemaOf(kind));
  });

  it("describes the input: keys with a default aren't required", () => {
    expect(jsonSchemaOf("agent")["required"]).toEqual(["id", "name"]);
    expect(jsonSchemaOf("deployments")["required"]).toEqual(["deployments"]);
  });

  it("includes Collection and Deployments, which the old export left out", () => {
    expect(jsonSchemaOf("collection")["required"]).toEqual(["id", "name", "fields"]);
    expect(jsonSchemaOf("collection")["additionalProperties"]).toBe(false);
    expect(jsonSchemaOf("deployments")["additionalProperties"]).toBe(false);
  });

  it("uses JSON Schema 2020-12", () => {
    for (const kind of kindNames()) {
      expect(jsonSchemaOf(kind)["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    }
  });
});

verifies("format.spec-id-version", () => {
  it.each(kindNames())("names the kind's version in the $id of %s", (kind) => {
    const spec = readSpecFile(kind);
    expect(spec["$id"]).toBe(
      `https://halonic.com/spec/format/${specName(kind)}/v${idVersion(spec)}.schema.json`,
    );
    expect(idVersion(spec)).toBe(kindVersion(spec));
  });

  it("falls back to SCHEMA_VERSION only for kinds without a version key", () => {
    const withoutVersion = kindNames().filter((kind) => {
      const properties = readSpecFile(kind)["properties"] as Record<string, unknown>;
      return !("version" in properties);
    });
    expect(withoutVersion).toEqual(["skill"]);
    expect(idVersion(readSpecFile("skill"))).toBe(SCHEMA_VERSION);
  });

  it("fails when the $id and the version key disagree", () => {
    const drifted = {
      $id: "https://halonic.com/spec/format/agent/v1.schema.json",
      properties: { version: { const: 2 } },
    };
    expect(idVersion(drifted)).not.toBe(kindVersion(drifted));
  });
});
