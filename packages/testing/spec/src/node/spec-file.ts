import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect } from "vitest";

// A spec file is the committed JSON Schema of a public API. It is what
// outsiders, reviewers and editors read, so the code must emit exactly it.
// To write spec files on purpose, run with SPEC_WRITE=1. Never in CI: there
// a missing or different spec file fails (plan 9.3).
const writeSpecFiles = process.env["SPEC_WRITE"] === "1" && process.env["CI"] === undefined;

/** The text of a spec file: pretty-printed JSON with a final newline. */
function specText(schema: object): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

/**
 * Expects the spec file at `path` to hold exactly `schema`. With
 * SPEC_WRITE=1, outside CI, it writes the file first; `write` overrides that.
 *
 * @example
 * expectSpecFile(join(specFolder, "agent.schema.json"), jsonSchemaOf("agent"));
 */
export function expectSpecFile(
  path: string,
  schema: object,
  { write = writeSpecFiles }: { readonly write?: boolean } = {},
): void {
  const expected = specText(schema);
  if (write) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, expected);
  }
  expect(existsSync(path), `missing spec file ${path}; run the test with SPEC_WRITE=1`).toBe(true);
  expect(readFileSync(path, "utf8"), `spec file ${path} differs from the code`).toBe(expected);
}
