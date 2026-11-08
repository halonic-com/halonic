import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { jsonSchemaOf, type KindName, kindNames } from "./index.ts";

/** Each kind's golden JSON Schema sits in its own folder: `kinds/<folder>/golden/<kind>.schema.json`. */
function goldenPath(kind: KindName): string {
  const folder = kind.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return join(import.meta.dirname, "kinds", folder, "golden", `${kind}.schema.json`);
}

function asText(schema: unknown): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

// To write new goldens on purpose, run with FORMAT_WRITE_GOLDEN=1. Never in
// CI: there a missing or different golden file fails (plan 9.3).
const writeGolden = process.env["FORMAT_WRITE_GOLDEN"] === "1" && process.env["CI"] === undefined;

verifies("format.json-schema-goldens", () => {
  it.each(kindNames())("writes the golden JSON Schema for %s", (kind) => {
    const path = goldenPath(kind);
    const actual = asText(jsonSchemaOf(kind));
    if (writeGolden) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, actual);
    }
    expect(existsSync(path), `missing golden file ${path}`).toBe(true);
    expect(actual).toBe(readFileSync(path, "utf8"));
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
