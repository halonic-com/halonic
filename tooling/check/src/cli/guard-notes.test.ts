import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "guard-notes.ts");

describe("guard-notes", () => {
  // guard-notes.yml runs this script from a base checkout with only
  // tooling/check installed (HAL-5670). Loading it must not fail on a missing
  // module, so with no arguments it has to reach its usage message.
  it("loads every import and prints its usage without arguments", () => {
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.stderr).toContain("Usage: node tooling/check/src/cli/guard-notes.ts");
    expect(result.status).toBe(2);
  });
});
