import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseLogLines } from "@halonicjs/ports";
import { JSON_SCHEMA_DRAFT, type JsonSchema, parse, toJsonSchema } from "@halonicjs/schema-kit";
import { findSecretShape } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expectSpecFile } from "@halonicjs/testing-spec/node";
import { expect, it } from "vitest";
import * as root from "../index.ts";
import { SPEC_ID_BASE } from "../json-schema.ts";
import {
  RUNTIME_EXPORT_FORMAT_VERSION,
  RUNTIME_EXPORT_MANIFEST,
  type RuntimeExportManifest,
  runtimeExportManifestSchema,
} from "./index.ts";

const example = join(import.meta.dirname, "fixtures", "example");

const hash = (bytes: Uint8Array | string, encoding?: "utf16le"): string =>
  createHash("sha256")
    .update(bytes as string, encoding ?? "utf8")
    .digest("hex");

/** Every file in a folder, as a path relative to it with `/` between its parts. */
function filesIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

function exampleManifest(): RuntimeExportManifest {
  const text = readFileSync(join(example, RUNTIME_EXPORT_MANIFEST), "utf8");
  return JSON.parse(text) as RuntimeExportManifest;
}

/** Each problem of a manifest as "path: message". */
function problems(manifest: unknown): string[] {
  const parsed = parse(runtimeExportManifestSchema, manifest);
  return parsed.ok ? [] : parsed.error.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

/** The example manifest with its last file, the run log, changed, so a changed path stays in order. */
function withRunLog(change: Record<string, unknown>): unknown {
  const manifest = exampleManifest();
  const last = manifest.files.length - 1;
  return {
    ...manifest,
    files: [...manifest.files.slice(0, last), { ...manifest.files[last], ...change }],
  };
}

/** What a file imports: `from "…"`, `import "…"`, `import("…")` and `require("…")`, in either quotes. */
const importSpecifier = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g;

/** The relative files `entry` imports, followed transitively, and every package it imports. */
function importsOf(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string): void => {
    if (files.has(file)) {
      return;
    }
    files.add(file);
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(importSpecifier)) {
      if (specifier?.startsWith(".")) {
        visit(resolve(dirname(file), specifier));
      } else if (specifier !== undefined) {
        packages.add(specifier);
      }
    }
  };
  visit(entry);
  return { files: [...files], packages: [...packages] };
}

verifies("format.runtime-export", () => {
  it("reads the example export", () => {
    expect(problems(exampleManifest())).toEqual([]);
  });

  it("lists every file of the example export once, with its size and hash", () => {
    const manifest = exampleManifest();
    const listed = manifest.files.map((file) => file.path).sort();
    expect(filesIn(example)).toEqual([...listed, RUNTIME_EXPORT_MANIFEST].sort());
    for (const file of manifest.files) {
      const bytes = readFileSync(join(example, file.path));
      expect({ bytes: bytes.length, sha256: hash(bytes) }).toEqual({
        bytes: file.bytes,
        sha256: file.sha256,
      });
    }
  });

  it("keeps the example's files in the layout halonic serve uses", () => {
    const runLog = readFileSync(join(example, "runs", "r-invoice.jsonl"), "utf8");
    expect(parseLogLines(runLog, "r-invoice", "r-invoice.jsonl")).toHaveLength(3);
    // A collection's log is named by the SHA-256 of its name in UTF-16LE, as `FileRecordStore` names it.
    expect(filesIn(join(example, "records"))).toEqual([`${hash("leads", "utf16le")}.jsonl`]);
  });

  it("finds no secret or token in any file of the example export", () => {
    for (const path of filesIn(example)) {
      expect(findSecretShape(readFileSync(join(example, path), "utf8")), path).toBeUndefined();
    }
  });

  it.each<[string, unknown, string]>([
    [
      "a key it doesn't list",
      { ...exampleManifest(), tokens: { google: "x" } },
      ': Unrecognized key: "tokens"',
    ],
    [
      "a key on a file it doesn't list",
      withRunLog({ secret: "x" }),
      'files.2: Unrecognized key: "secret"',
    ],
    [
      "a harness sign-in",
      withRunLog({ path: "harness-settings/clerk/claude-code/auth.json" }),
      "files.2.path",
    ],
    ["a token store", withRunLog({ path: "tokens/google.json" }), "files.2.path"],
    ["a run snapshot", withRunLog({ path: "runs/r-invoice.snapshot.json" }), "files.2.path"],
    ["a run lock", withRunLog({ path: "runs/r-invoice.lock" }), "files.2.path"],
    ["a path that leaves the folder", withRunLog({ path: "runs/../../x.jsonl" }), "files.2.path"],
    ["a run named after a Windows device", withRunLog({ path: "runs/NUL.jsonl" }), "files.2.path"],
    [
      "a records log named by its collection",
      withRunLog({ path: "records/leads.jsonl" }),
      "files.2.path",
    ],
    ["a hash in capitals", withRunLog({ sha256: "A".repeat(64) }), "files.2.sha256"],
    ["a negative size", withRunLog({ bytes: -1 }), "files.2.bytes"],
    [
      "a deployment id with capitals",
      { ...exampleManifest(), deployment: "Staging" },
      "deployment",
    ],
    ["a local time", { ...exampleManifest(), exportedAt: "2026-11-05 08:00" }, "exportedAt"],
    ["month 13", { ...exampleManifest(), exportedAt: "2026-13-05T08:00:00.000Z" }, "exportedAt"],
    ["30 February", { ...exampleManifest(), exportedAt: "2026-02-30T08:00:00Z" }, "exportedAt"],
    ["hour 24", { ...exampleManifest(), exportedAt: "2026-11-05T24:00:00.000Z" }, "exportedAt"],
    ["a format version as text", { ...exampleManifest(), formatVersion: "1" }, "formatVersion"],
  ])("refuses %s", (_name, manifest, expected) => {
    const found = problems(manifest);
    expect(found).toHaveLength(1);
    expect(found[0]?.startsWith(expected)).toBe(true);
  });

  it("accepts a leap day and a time without milliseconds", () => {
    expect(problems({ ...exampleManifest(), exportedAt: "2028-02-29T23:59:59Z" })).toEqual([]);
  });

  it("refuses a blob whose path isn't made of its hash", () => {
    const manifest = exampleManifest();
    const blob = manifest.files[0];
    const moved = { ...blob, path: `blobs/00/${blob?.sha256}` };
    expect(problems({ ...manifest, files: [moved, ...manifest.files.slice(1)] })).toEqual([
      "files.0.sha256: A blob's path must be blobs/<first two characters>/<SHA-256 of its bytes>",
    ]);
  });

  it("refuses two files whose paths open the same file", () => {
    const manifest = exampleManifest();
    const [blob, records, run] = manifest.files;
    // Capitals sort first, so the twin comes before the run log and the run log is the second.
    const twin = { ...run, path: "runs/R-Invoice.jsonl" };
    expect(problems({ ...manifest, files: [blob, records, twin, run] })).toEqual([
      "files.3.path: Another file has this path",
    ]);
  });

  it("refuses files that aren't in order of their path", () => {
    const manifest = exampleManifest();
    const [blob, records, run] = manifest.files;
    expect(problems({ ...manifest, files: [records, blob, run] })).toEqual([
      "files.1.path: List the files in order of their path",
    ]);
  });

  it("lists the example's files in order of their path", () => {
    const paths = exampleManifest().files.map((file) => file.path);
    expect(paths).toEqual([...paths].sort());
  });

  it("refuses a newer format and says to update Halonic", () => {
    expect(problems({ ...exampleManifest(), formatVersion: 2 })).toEqual([
      "formatVersion: This export is in format 2, and this Halonic reads format 1. Update Halonic to import it.",
    ]);
  });

  it("matches its spec file, the format outsiders read", () => {
    const schema: JsonSchema = {
      $schema: JSON_SCHEMA_DRAFT,
      $id: `${SPEC_ID_BASE}/runtime-export/v${RUNTIME_EXPORT_FORMAT_VERSION}.schema.json`,
      ...toJsonSchema(runtimeExportManifestSchema),
    };
    expectSpecFile(
      join(import.meta.dirname, "..", "..", "spec", "runtime-export.schema.json"),
      schema,
    );
    expect(schema["additionalProperties"]).toBe(false);
  });

  it("sees every way a file can import a package", () => {
    const text = `import { a } from "a";\nimport "b";\nawait import( 'c' );\nrequire("d");\nimport type { E } from "e";`;
    expect([...text.matchAll(importSpecifier)].map(([, specifier]) => specifier)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("imports no YAML parser and isn't re-exported from the package root", () => {
    const { files, packages } = importsOf(join(import.meta.dirname, "index.ts"));
    expect(packages.sort()).toEqual(["@halonicjs/ports", "@halonicjs/schema-kit"]);
    expect(files.some((file) => file.endsWith("parse-file.ts"))).toBe(false);
    expect(Object.keys(root)).not.toContain("runtimeExportManifestSchema");
  });
});
