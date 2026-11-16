import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import * as root from "../index.ts";
import { importsOf } from "../test/imports-of.spec.ts";
import * as entry from "./index.ts";

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
