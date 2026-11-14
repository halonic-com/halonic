import { readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { hash } from "./tool-approval-files.test-helper.ts";

interface GoldenCase {
  readonly location: string;
  readonly source: string;
  readonly folder: string;
}

/** The cases the Studio shell's Rust code is checked against too (`halonic-profile`). */
const golden: GoldenCase[] = JSON.parse(
  await readFile(new URL("./golden/tool-approval-source-folders.json", import.meta.url), "utf8"),
);

verifies("fs-node.tool-approval-files", () => {
  it("names a source's folder as the Studio shell does, for every golden case", () => {
    for (const { location, source, folder } of golden) {
      expect(hash(JSON.stringify([location, source]))).toBe(folder);
    }
  });
});
