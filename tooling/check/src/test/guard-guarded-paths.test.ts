import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { checkGuardedPaths } from "../guard/guarded-paths.ts";
import { type GuardCase, noteCovering, noteFile, runGuard } from "./guard-fixture.ts";

const checks = [checkGuardedPaths];

async function errorsOf(guardCase: Omit<GuardCase, "base" | "head" | "checks">): Promise<string[]> {
  const { errors } = await runGuard({ base: {}, head: {}, checks, ...guardCase });
  return errors.map((error) => error.replace(/ That needs a decision note: .*$/, ""));
}

verifies("check.guard-own-paths", () => {
  test.each([
    [".github/", ".github/workflows/ci.yml"],
    [".github/", ".github/actions/setup/action.yml"],
    [
      "packages/testing/parity/allowed-differences.json",
      "packages/testing/parity/allowed-differences.json",
    ],
    ["packages/testing/spec/", "packages/testing/spec/src/verifies.ts"],
    ["tooling/check/", "tooling/check/src/guard/guard.ts"],
    ["tooling/config/src/vitest-preset.ts", "tooling/config/src/vitest-preset.ts"],
    ["turbo.json", "turbo.json"],
  ])("fails when a file under %s changes: %s", async (path, file) => {
    const errors = await errorsOf({
      baseOutside: { [file]: "before\n" },
      headOutside: { [file]: "after\n" },
    });
    expect(errors).toEqual([
      `${file}: ${file} was changed, and ${path} is part of the requirement guard.`,
    ]);
  });

  test("fails when a guarded file is added or deleted", async () => {
    const file = ".github/workflows/release.yml";
    expect(await errorsOf({ headOutside: { [file]: "on: push\n" } })).toEqual([
      `${file}: ${file} was added, and .github/ is part of the requirement guard.`,
    ]);
    expect(await errorsOf({ baseOutside: { [file]: "on: push\n" } })).toEqual([
      `${file}: ${file} was deleted, and .github/ is part of the requirement guard.`,
    ]);
  });

  test("passes unchanged guarded files, and files that only look like guarded paths", async () => {
    const same = { "turbo.json": "{}\n", ".github/workflows/ci.yml": "on: push\n" };
    expect(await errorsOf({ shared: same })).toEqual([]);
    const nearby = {
      "tooling/config/biome.jsonc": "{}\n",
      "tooling/checker/x.ts": "export {};\n",
      "turbo.json.bak": "{}\n",
      ".githubx/notes.md": "x\n",
      "packages/testing/parity/src/compare.ts": "export {};\n",
    };
    expect(await errorsOf({ headOutside: nearby })).toEqual([]);
  });

  test("passes a change the note covers by its guarded path, not by the file alone", async () => {
    const changed = {
      baseOutside: { ".github/workflows/ci.yml": "on: push\n" },
      headOutside: { ".github/workflows/ci.yml": "on: pull_request\n" },
    };
    expect(await errorsOf({ ...changed, note: noteCovering(".github/") })).toEqual([]);
    expect(await errorsOf({ ...changed, note: noteCovering(".github/workflows/ci.yml") })).toEqual([
      `.github/workflows/ci.yml: .github/workflows/ci.yml was changed, and .github/ is part of the requirement guard. ${noteFile} doesn't list ".github/" under Covers.`,
    ]);
  });
});
