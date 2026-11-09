import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonSchemaOf, kindNames } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { schemaCommand, schemaFileName } from "./command.ts";

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "golden", "schema-output.json"), "utf8"),
);

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-schema-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

verifies("cli.commands.schema.write-every-kind", () => {
  it("writes one file per kind with the format package's JSON Schema", async () => {
    const io = captureIo(folder);
    expect(await runCli(["schema", "out/nested"], io, [schemaCommand])).toBe(exitCode.ok);
    const written = join(folder, "out", "nested");
    for (const kind of kindNames()) {
      const text = readFileSync(join(written, schemaFileName(kind)), "utf8");
      expect(text).toBe(`${JSON.stringify(jsonSchemaOf(kind), null, 2)}\n`);
    }
  });

  it("gives the golden output and file list in the default folder", async () => {
    const io = captureIo(folder);
    expect(await runCli(["schema"], io, [schemaCommand])).toBe(exitCode.ok);
    expect({
      stdout: io.stdout,
      stderr: io.stderr,
      files: readdirSync(join(folder, "schemas")).sort(),
    }).toEqual(golden);
  });

  it("refuses more than one folder", async () => {
    const io = captureIo(folder);
    expect(await runCli(["schema", "a", "b"], io, [schemaCommand])).toBe(exitCode.usage);
    expect(io.stderr).toEqual(["✕ Give at most one folder.", "  Usage: halonic schema [outDir]"]);
  });
});
