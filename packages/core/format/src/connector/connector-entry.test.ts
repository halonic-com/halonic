import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import * as root from "../index.ts";
import { importsOf } from "../test/imports-of.spec.ts";
import { needsApproval } from "./index.ts";

verifies("format.connector-approve-all", () => {
  it("loads no yaml: the entry imports only schema-kit and std, never parse-file.ts or source.ts", () => {
    const { files, packages } = importsOf(join(import.meta.dirname, "index.ts"));
    expect(packages).toEqual(["@halonicjs/schema-kit", "@halonicjs/std"]);
    expect(files.some((file) => /(parse-file|source)\.ts$/.test(file))).toBe(false);
  });

  it("decides as the main entry point does", () => {
    expect(needsApproval).toBe(root.needsApproval);
  });
});
