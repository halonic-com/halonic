import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { verifies } from "../verifies.ts";
import { expectSpecFile } from "./spec-file.ts";

const schema = { type: "object", properties: { name: { type: "string" } } };

verifies("spec.expect-spec-file", () => {
  it("fails when a spec file is missing or differs from the code", () => {
    const path = join(mkdtempSync(join(tmpdir(), "testing-spec-")), "agent.schema.json");
    const check = (): void => expectSpecFile(path, schema, { write: false });
    expect(check).toThrow(/missing spec file/);
    writeFileSync(path, "{}\n");
    expect(check).toThrow(/differs from the code/);
  });

  it("writes the file when asked to, in the committed text form", () => {
    const path = join(mkdtempSync(join(tmpdir(), "testing-spec-")), "deep", "a.schema.json");
    expectSpecFile(path, schema, { write: true });
    expect(readFileSync(path, "utf8")).toBe(`${JSON.stringify(schema, null, 2)}\n`);
    expectSpecFile(path, schema, { write: false });
  });
});
