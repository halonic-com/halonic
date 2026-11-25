import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");
const workflow = () =>
  readFileSync(resolve(process.cwd(), "../../.github/workflows/studio-preview.yml"), "utf8");

// A plain script the workflow runs with the runner's own Node, so it has no
// types: imported by path, with the one function it exports typed here.
const script = pathToFileURL(join(shellFolder, "windows/preview-version.mjs")).href;
const { previewVersion } = (await import(script)) as {
  previewVersion: (releaseVersion: string, runNumber: string | number) => string;
};

/**
 * Semver precedence, as the installer's SemverCompare reads it, for the two
 * shapes in play here: `1.2.3` and `1.2.3-<identifiers>`. Below zero when `a`
 * is older.
 */
function comparePrecedence(a: string, b: string): number {
  const [coreA = "", preA] = a.split(/-(.*)/s);
  const [coreB = "", preB] = b.split(/-(.*)/s);
  const numbersA = coreA.split(".").map(Number);
  const numbersB = coreB.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (numbersA[index] ?? 0) - (numbersB[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (preA === undefined || preB === undefined) {
    // A release is newer than its own pre-releases.
    return (preA === undefined ? 1 : 0) - (preB === undefined ? 1 : 0);
  }
  return compareIdentifiers(preA.split("."), preB.split("."));
}

/** Pre-release identifiers: numbers by value, below text, and fewer below more. */
function compareIdentifiers(a: string[], b: string[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = compareIdentifier(a[index] ?? "", b[index] ?? "");
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

/** One pre-release identifier: numbers by value, and below text. */
function compareIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left.localeCompare(right, "en");
}

verifies("studio.installer-preview-version", () => {
  describe("the preview version", () => {
    it("is the next patch, as a pre-release numbered by the run", () => {
      expect(previewVersion("0.1.0", 41)).toBe("0.1.1-preview.41");
      expect(previewVersion("2.3.9", "7")).toBe("2.3.10-preview.7");
    });

    it("rises with every run, above the release and below the next patch", () => {
      const runs = [1, 2, 9, 10, 41, 42, 100, 65536];
      const versions = runs.map((run) => previewVersion("0.1.0", run));
      for (let index = 1; index < versions.length; index += 1) {
        expect(comparePrecedence(versions[index - 1] ?? "", versions[index] ?? "")).toBeLessThan(0);
      }
      for (const version of versions) {
        expect(comparePrecedence("0.1.0", version)).toBeLessThan(0);
        expect(comparePrecedence(version, "0.1.1")).toBeLessThan(0);
      }
    });

    it("refuses a run number that isn't above zero and a version that isn't a release", () => {
      expect(() => previewVersion("0.1.0", 0)).toThrow("'0' isn't a run number above zero");
      expect(() => previewVersion("0.1.0", "abc")).toThrow("'abc' isn't a run number");
      expect(() => previewVersion("0.1.0-beta.1", 3)).toThrow(
        "'0.1.0-beta.1' isn't a release version",
      );
    });
  });

  it("builds the preview with that version and updates the release version with it", () => {
    const text = workflow();
    expect(text).toContain(
      "node windows/preview-version.mjs tauri.conf.json $env:GITHUB_RUN_NUMBER",
    );
    expect(text).toContain('build-installer.ps1 -Config "$env:RUNNER_TEMP/preview.conf.json"');
    expect(text).toContain("pwsh windows/build-installer.ps1 -Step pack");
    expect(text).toContain('foreach ($installer in "$env:RUNNER_TEMP/older-setup.exe", $setup)');
    expect(text).toContain("if ($installed -ne $env:PREVIEW_VERSION)");
  });
});
