import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { appVersionFiles } from "./app-version.ts";
import { appVersionProblems, type ReadFile, syncAppVersion } from "./app-version-sync.ts";

const fixtures = join(import.meta.dirname, "..", "test", "fixtures", "app-version");
const fixture = (name: string): string => readFileSync(join(fixtures, name), "utf8");
const connectManifest = "apps/studio/src-tauri/crates/connect/Cargo.toml";

/** The four fixture files at 0.1.0, with package.json at `version`. */
function repo(version: unknown, changes: Record<string, string | undefined> = {}): ReadFile {
  const files: Record<string, string | undefined> = {
    [appVersionFiles.packageJson]: `${JSON.stringify({ name: "@halonicjs/app-studio", version })}\n`,
    [appVersionFiles.tauriConfig]: fixture("tauri.conf.json"),
    [appVersionFiles.cargoToml]: fixture("Cargo.toml"),
    [appVersionFiles.cargoLock]: fixture("Cargo.lock"),
    [connectManifest]: fixture("connect.Cargo.toml"),
    ...changes,
  };
  return (file) => files[file];
}

/** The lines that differ between two texts of the same length. */
function changedLines(before: string, after: string): string[] {
  const old = before.split("\n");
  return after.split("\n").filter((line, index) => line !== old[index]);
}

verifies("check.app-version-sync", () => {
  test("sets all three files to the package.json version and touches no other line", () => {
    const changed = syncAppVersion(repo("0.2.0"));
    expect([...changed.keys()]).toEqual([
      appVersionFiles.tauriConfig,
      appVersionFiles.cargoToml,
      appVersionFiles.cargoLock,
    ]);
    const lines = (file: string, name: string) =>
      changedLines(fixture(name), changed.get(file) ?? "");
    expect(lines(appVersionFiles.tauriConfig, "tauri.conf.json")).toEqual([
      '  "version": "0.2.0",',
    ]);
    expect(lines(appVersionFiles.cargoToml, "Cargo.toml")).toEqual(['version = "0.2.0"']);
    expect(lines(appVersionFiles.cargoLock, "Cargo.lock")).toEqual([
      'version = "0.2.0"',
      'version = "0.2.0"',
    ]);
  });

  test("keeps crates.io crates in Cargo.lock at their own version", () => {
    const lock = syncAppVersion(repo("0.2.0")).get(appVersionFiles.cargoLock) ?? "";
    expect(lock).toContain('name = "serde"\nversion = "1.0.0"');
  });

  test("leaves out files that don't exist yet", () => {
    const changed = syncAppVersion(repo("0.2.0", { [appVersionFiles.tauriConfig]: undefined }));
    expect([...changed.keys()]).toEqual([appVersionFiles.cargoToml, appVersionFiles.cargoLock]);
  });

  test("adds the version to a [workspace.package] table that has none", () => {
    const cargo = fixture("Cargo.toml").replace('version = "0.1.0"\n', "");
    const changed = syncAppVersion(repo("0.2.0", { [appVersionFiles.cargoToml]: cargo }));
    expect(changed.get(appVersionFiles.cargoToml)).toContain(
      '[workspace.package]\nversion = "0.2.0"\n',
    );
  });

  test("fails and changes nothing when package.json has no semver version", () => {
    expect(() => syncAppVersion(repo(undefined))).toThrow(/needs a "version" like "0.1.0"/);
    expect(() => syncAppVersion(repo("v0.2.0"))).toThrow(/it has "v0.2.0"/);
  });

  test("changes nothing when every file already has the version", () => {
    expect(syncAppVersion(repo("0.1.0")).size).toBe(0);
  });
});

verifies("check.versions-agree", () => {
  const problems = (read: ReadFile) =>
    appVersionProblems(read, [appVersionFiles.cargoToml, connectManifest]);

  test("passes when all four files agree", () => {
    expect(problems(repo("0.1.0"))).toEqual([]);
  });

  test("fails on each file that differs, with the line and the fix", () => {
    const found = problems(repo("0.2.0"));
    expect(found.map(({ file, line }) => [file, line])).toEqual([
      [appVersionFiles.tauriConfig, undefined],
      [appVersionFiles.cargoToml, 17],
      [appVersionFiles.cargoLock, 7],
      [appVersionFiles.cargoLock, 11],
    ]);
    expect(found[0]?.message).toBe(
      "has version 0.1.0, but the app is 0.2.0. Run `pnpm version:sync` to copy the version from apps/studio/package.json.",
    );
  });

  test("fails on one workspace crate in Cargo.lock that drifted, not on crates.io crates", () => {
    const lock = fixture("Cargo.lock").replace(
      'name = "halonic-connect"\nversion = "0.1.0"',
      'name = "halonic-connect"\nversion = "0.0.9"',
    );
    const found = problems(repo("0.1.0", { [appVersionFiles.cargoLock]: lock }));
    expect(found.map(({ file, line }) => [file, line])).toEqual([[appVersionFiles.cargoLock, 7]]);
  });

  test("fails on a crate that sets its own version", () => {
    const own = fixture("connect.Cargo.toml").replace(
      "version.workspace = true",
      'version = "0.1.0"',
    );
    const found = problems(repo("0.1.0", { [connectManifest]: own }));
    expect(found).toEqual([
      {
        file: connectManifest,
        message:
          "sets its own version. Use `version.workspace = true`, so every crate carries the app version.",
      },
    ]);
  });

  test("accepts the inline-table way of inheriting the version", () => {
    const inline = fixture("connect.Cargo.toml").replace(
      "version.workspace = true",
      "version = { workspace = true }",
    );
    expect(problems(repo("0.1.0", { [connectManifest]: inline }))).toEqual([]);
  });

  test("passes with nothing to compare", () => {
    const none = {
      [appVersionFiles.tauriConfig]: undefined,
      [appVersionFiles.cargoToml]: undefined,
    };
    expect(problems(repo(undefined, none))).toEqual([]);
  });

  test("fails on package.json when there is a Cargo.toml but no app version", () => {
    const found = problems(repo(undefined, { [appVersionFiles.tauriConfig]: undefined }));
    expect(found.map(({ file }) => file)).toEqual([appVersionFiles.packageJson]);
  });
});
