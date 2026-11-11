import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { checkGuardedPaths, onlyExtraExportsChanged, policyFile } from "../guard/guarded-paths.ts";
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

const realPolicy = JSON.parse(
  readFileSync(new URL("../../policy.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

/** The real policy.json with `changes` applied, as written to disk. */
const policyWith = (changes: Record<string, unknown> = {}): string =>
  `${JSON.stringify({ ...realPolicy, ...changes }, null, 2)}\n`;

const withExport = {
  extraExports: { ...(realPolicy["extraExports"] as object), "@halonicjs/example": ["./node"] },
};

verifies("check.guard-extra-exports", () => {
  test("reports a change to extraExports alone under policy.json, not tooling/check/", async () => {
    const changed = {
      baseOutside: { [policyFile]: policyWith() },
      headOutside: { [policyFile]: policyWith(withExport) },
    };
    expect(await errorsOf(changed)).toEqual([
      `${policyFile}: ${policyFile} was changed in extraExports only, which needs a note that lists ${policyFile}.`,
    ]);
    expect(await errorsOf({ ...changed, note: noteCovering(policyFile) })).toEqual([]);
    expect(await errorsOf({ ...changed, note: noteCovering("tooling/check/") })).toEqual([
      expect.stringContaining(`doesn't list "${policyFile}" under Covers`),
    ]);
  });

  test("keeps any other change to policy.json under tooling/check/", async () => {
    const other = { ...withExport, published: ["@halonicjs/example"] };
    const errors = await errorsOf({
      baseOutside: { [policyFile]: policyWith() },
      headOutside: { [policyFile]: policyWith(other) },
      note: noteCovering(policyFile),
    });
    expect(errors).toEqual([
      expect.stringContaining(
        `${policyFile} was changed, and tooling/check/ is part of the requirement guard.`,
      ),
    ]);
  });

  test("counts only a change limited to extraExports between two JSON objects", () => {
    const before = policyWith();
    expect(onlyExtraExportsChanged(before, policyWith(withExport))).toBe(true);
    expect(onlyExtraExportsChanged(before, before)).toBe(false);
    expect(onlyExtraExportsChanged(before, policyWith({ extraExports: undefined }))).toBe(true);
    expect(onlyExtraExportsChanged(undefined, before)).toBe(false);
    expect(onlyExtraExportsChanged(before, undefined)).toBe(false);
    expect(onlyExtraExportsChanged(before, "{ not json")).toBe(false);
    expect(onlyExtraExportsChanged("[]", "[1]")).toBe(false);
    expect(onlyExtraExportsChanged(before, policyWith({ ...withExport, fileSize: {} }))).toBe(
      false,
    );
    // A key moved to another place is a change outside extraExports, too.
    const { coreOrder, ...rest } = realPolicy;
    const moved = `${JSON.stringify({ ...rest, coreOrder, ...withExport }, null, 2)}\n`;
    expect(onlyExtraExportsChanged(before, moved)).toBe(false);
  });
});
