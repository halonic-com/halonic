import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { impurities } from "../signals/purity.test-helper.ts";

const rules = join(import.meta.dirname, "rules");

verifies("paperclip.fast-track-lifecycle", () => {
  it("each workflow rule is a pure ToolScript rule", () => {
    const files = readdirSync(rules).filter((file) => file.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(impurities(file, readFileSync(join(rules, file), "utf8")), file).toEqual([]);
    }
  });
});
