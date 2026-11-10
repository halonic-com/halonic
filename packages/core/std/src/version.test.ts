import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { compareVersions, formatVersion, isAtLeast, readVersion, type Version } from "./version.ts";

/** Reads a version the test knows is valid. */
function version(text: string): Version {
  const read = readVersion(text);
  if (read === undefined) {
    throw new Error(`The test version ${text} isn't valid.`);
  }
  return read;
}

verifies("std.version", () => {
  describe("readVersion", () => {
    it.each([
      ["0.167.0", { major: 0, minor: 167, patch: 0, prerelease: [] }],
      ["2.1.321", { major: 2, minor: 1, patch: 321, prerelease: [] }],
      ["0.169.0-alpha.6", { major: 0, minor: 169, patch: 0, prerelease: ["alpha", 6] }],
      ["1.0.0-rc.1+linux.x64", { major: 1, minor: 0, patch: 0, prerelease: ["rc", 1] }],
      ["1.0.0+20261110", { major: 1, minor: 0, patch: 0, prerelease: [] }],
      ["1.0.0-0a.x-y", { major: 1, minor: 0, patch: 0, prerelease: ["0a", "x-y"] }],
    ])("reads %j", (text, expected) => {
      expect(readVersion(text)).toEqual(expected);
    });

    it.each([
      "",
      "v2.1.321",
      "2.1",
      "2.1.321.4",
      "01.2.3",
      "1.02.3",
      "2.1.321 (Claude Code)",
      " 2.1.321",
      "1.0.0-",
      "1.0.0-alpha..1",
      "1.0.0-01",
      "1.0.0+",
    ])("reads no version in %j", (text) => {
      expect(readVersion(text)).toBeUndefined();
    });
  });

  describe("formatVersion", () => {
    it.each(["2.1.321", "0.169.0-alpha.6", "1.0.0-rc.1"])("writes %s back as it was", (text) => {
      expect(formatVersion(version(text))).toBe(text);
    });

    it("leaves the build part out", () => {
      expect(formatVersion(version("1.0.0+linux"))).toBe("1.0.0");
    });
  });

  describe("compareVersions", () => {
    // semver.org's own example of the order, oldest first, plus releases around it.
    const ordered = [
      "0.9.9",
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
      "1.0.1",
      "1.1.0",
      "2.0.0",
      "10.0.0",
    ];

    it("puts every version after the ones before it", () => {
      for (let index = 1; index < ordered.length; index++) {
        const older = version(ordered[index - 1] as string);
        const newer = version(ordered[index] as string);
        expect(compareVersions(older, newer)).toBeLessThan(0);
        expect(compareVersions(newer, older)).toBeGreaterThan(0);
      }
    });

    it("compares pre-release numbers by value", () => {
      expect(compareVersions(version("0.167.0-alpha.9"), version("0.167.0-alpha.10"))).toBeLessThan(
        0,
      );
    });

    it("finds a version equal to itself, whatever its build part", () => {
      expect(compareVersions(version("1.0.0-rc.1"), version("1.0.0-rc.1"))).toBe(0);
      expect(compareVersions(version("1.0.0+linux"), version("1.0.0+darwin"))).toBe(0);
    });
  });

  describe("isAtLeast", () => {
    const minimum = version("0.166.0");

    it.each([
      ["0.166.0", true],
      ["0.166.1", true],
      ["0.167.0-alpha.6", true],
      ["1.0.0", true],
      ["0.166.0-alpha.3", false],
      ["0.165.9", false],
    ])("%s against 0.166.0 is %s", (text, expected) => {
      expect(isAtLeast(version(text), minimum)).toBe(expected);
    });
  });
});
