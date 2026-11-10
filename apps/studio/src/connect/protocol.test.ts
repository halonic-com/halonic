import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  JSON_SCHEMA_DRAFT,
  type JsonSchema,
  parse,
  type Schema,
  toJsonSchema,
} from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectResultSchema, helloAnswerSchema } from "./protocol.ts";

const crate = join(import.meta.dirname, "..", "..", "src-tauri", "crates", "connect");

// To write the spec files on purpose, run with SPEC_WRITE=1, never in CI.
const writeSpecFiles = process.env["SPEC_WRITE"] === "1" && process.env["CI"] === undefined;

/** The spec file's JSON Schema: `$schema` and `$id` first, as in `@halonicjs/format`. */
function specOf(name: string, schema: Schema): JsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    $id: `https://halonic.com/spec/connect/${name}/v1.schema.json`,
    ...toJsonSchema(schema),
  };
}

/** Expects the committed spec file to hold exactly what the code produces. */
function expectSpecFile(name: string, schema: Schema): void {
  const path = join(crate, "spec", `${name}.schema.json`);
  const expected = `${JSON.stringify(specOf(name, schema), null, 2)}\n`;
  if (writeSpecFiles) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, expected);
  }
  expect(existsSync(path), `missing spec file ${path}; run the test with SPEC_WRITE=1`).toBe(true);
  expect(readFileSync(path, "utf8"), `spec file ${path} differs from the code`).toBe(expected);
}

/** The fixture files of one message: `fixtures/<message>/<valid or invalid>/<case>`, as raw text. */
function fixtures(message: string, group: "valid" | "invalid"): [string, string][] {
  const folder = join(crate, "fixtures", message, group);
  return readdirSync(folder)
    .sort()
    .map((file) => [file, readFileSync(join(folder, file), "utf8")]);
}

/** Whether the text is JSON that matches the schema. Other text, such as an HTML page, never does. */
function matches(schema: Schema, text: string): boolean {
  try {
    return parse(schema, JSON.parse(text)).ok;
  } catch {
    return false;
  }
}

verifies("studio.src-tauri.crates.connect.hello-answer", () => {
  it("keeps the committed spec file in step with the schema", () => {
    expectSpecFile("hello-answer", helloAnswerSchema);
  });

  it.each(fixtures("hello-answer", "valid"))("accepts the fixture %s", (_file, text) => {
    expect(matches(helloAnswerSchema, text)).toBe(true);
  });

  it.each(fixtures("hello-answer", "invalid"))("rejects the fixture %s", (_file, text) => {
    expect(matches(helloAnswerSchema, text)).toBe(false);
  });
});

verifies("studio.src-tauri.crates.connect.connect-result", () => {
  it("keeps the committed spec file in step with the schema", () => {
    expectSpecFile("connect-result", connectResultSchema);
  });

  it.each(fixtures("connect-result", "valid"))("accepts the fixture %s", (_file, text) => {
    expect(matches(connectResultSchema, text)).toBe(true);
  });

  it.each(fixtures("connect-result", "invalid"))("rejects the fixture %s", (_file, text) => {
    expect(matches(connectResultSchema, text)).toBe(false);
  });

  it("has one valid fixture for every kind", () => {
    const kinds = fixtures("connect-result", "valid").map(([, text]) => JSON.parse(text).kind);
    const expected = connectResultSchema.options.map((option) => option.shape.kind.value);
    expect(kinds.sort()).toEqual([...expected].sort());
  });
});
