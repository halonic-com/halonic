import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import * as root from "../index.ts";
import * as entry from "./index.ts";

/** What a file imports: `from "…"`, `import "…"` and `import("…")`, in either quotes. */
const importSpecifier = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g;

/** The relative files `file` imports, followed transitively, and every package it imports. */
function importsOf(file: string, seen = new Set<string>(), packages = new Set<string>()) {
  if (!seen.has(file)) {
    seen.add(file);
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(importSpecifier)) {
      if (specifier?.startsWith(".")) {
        importsOf(resolve(dirname(file), specifier), seen, packages);
      } else if (specifier !== undefined) {
        packages.add(specifier);
      }
    }
  }
  return { files: [...seen], packages: [...packages].sort() };
}

verifies("format.routine-file", () => {
  it("loads no yaml: the entry imports only schema-kit, never parse-file.ts or source.ts", () => {
    const { files, packages } = importsOf(join(import.meta.dirname, "index.ts"));
    expect(packages).toEqual(["@halonicjs/schema-kit"]);
    expect(files.some((file) => /(parse-file|source)\.ts$/.test(file))).toBe(false);
  });

  it("shares the refused headers with the main entry point", () => {
    expect(entry.WEBHOOK_REFUSED_HEADERS).toBe(root.WEBHOOK_REFUSED_HEADERS);
  });
});
