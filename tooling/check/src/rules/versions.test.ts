import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { appVersionFiles } from "../lib/app-version.ts";
import { syncAppVersion } from "../lib/app-version-sync.ts";
import type { CheckContext } from "../lib/context.ts";
import { checkVersions } from "./versions.ts";

const fixtures = join(import.meta.dirname, "..", "test", "fixtures", "app-version");

/** A repo whose four version files all agree on `version`. */
function repoAt(version: string): CheckContext {
  const files = new Map<string, string>([
    [
      appVersionFiles.packageJson,
      `${JSON.stringify({ name: "@halonicjs/app-studio", version })}\n`,
    ],
    [appVersionFiles.tauriConfig, readFileSync(join(fixtures, "tauri.conf.json"), "utf8")],
    [appVersionFiles.cargoToml, readFileSync(join(fixtures, "Cargo.toml"), "utf8")],
    [appVersionFiles.cargoLock, readFileSync(join(fixtures, "Cargo.lock"), "utf8")],
  ]);
  for (const [file, text] of syncAppVersion((file) => files.get(file))) {
    files.set(file, text);
  }
  return {
    files: [...files.keys()],
    read: (file: string) => files.get(file) ?? "",
  } as unknown as CheckContext;
}

const failingFiles = (context: CheckContext): string[] =>
  checkVersions(context).problems.map((problem) => problem.file);

verifies("check.versions-refuse-1-0-0", () => {
  test("fails on package.json when every file agrees on 1.0.0", () => {
    const problems = checkVersions(repoAt("1.0.0")).problems;
    expect(problems.map((problem) => problem.file)).toEqual([appVersionFiles.packageJson]);
    expect(problems[0]?.message).toContain("Use 1.0.1 or 1.1.0");
  });

  test("fails on a pre-release of 1.0.0", () => {
    expect(failingFiles(repoAt("1.0.0-rc.1"))).toEqual([appVersionFiles.packageJson]);
  });

  test("passes for 0.1.1 and 1.0.1", () => {
    expect(failingFiles(repoAt("0.1.1"))).toEqual([]);
    expect(failingFiles(repoAt("1.0.1"))).toEqual([]);
  });
});
