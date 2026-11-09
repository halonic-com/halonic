import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { jsonSchemaOf, type KindName, kindNames } from "./index.ts";
import { expectSpecFile } from "./test/spec-file.spec.ts";

/** Each kind's spec file sits in the package's `spec/` folder: `spec/<kind folder>.schema.json`. */
function specPath(kind: KindName): string {
  const folder = kind.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return join(import.meta.dirname, "..", "spec", `${folder}.schema.json`);
}

verifies("format.json-schema-goldens", () => {
  it.each(kindNames())("matches the spec file for %s", (kind) => {
    expectSpecFile(specPath(kind), jsonSchemaOf(kind));
  });

  it("fails when a spec file is missing or differs from the code", () => {
    const path = join(mkdtempSync(join(tmpdir(), "format-spec-")), "agent.schema.json");
    const check = (): void => expectSpecFile(path, jsonSchemaOf("agent"), { write: false });
    expect(check).toThrow(/missing spec file/);
    writeFileSync(path, "{}\n");
    expect(check).toThrow(/differs from the code/);
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
