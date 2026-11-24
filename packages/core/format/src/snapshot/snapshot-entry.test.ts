import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { importsOf } from "../test/imports-of.spec.ts";

verifies("format.workspace-snapshot", () => {
  it("loads no yaml: the entry a runtime reads snapshots with never imports parse-file.ts or source.ts", () => {
    const { files, packages } = importsOf(join(import.meta.dirname, "index.ts"));
    expect(packages).not.toContain("@halonicjs/yaml");
    expect(files.some((file) => /(parse-file|source|build)\.ts$/.test(file))).toBe(false);
  });
});
