import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { canonicalTokenName } from "./token-name.ts";

/**
 * The cases the desktop shell checks its own secret names against, so the
 * CLI and the app store a secret under the same keychain entry. Each line is a
 * name, a tab, then its canonical form or `INVALID`. Its path is also a test
 * input in this package's `turbo.json`, so a change to it re-runs this test.
 */
const sharedCases = new URL(
  "../../../../apps/studio/src-tauri/crates/secrets/tests/fixtures/canonical-names.tsv",
  import.meta.url,
);

function readSharedCases(): { name: string; expected: string }[] {
  return readFileSync(sharedCases, "utf8")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const [name = "", expected = ""] = line.split("\t");
      return { name, expected };
    });
}

verifies("token-store.token-names", () => {
  it("treats case and - versus _ as the same name", () => {
    expect(canonicalTokenName("Google-Refresh")).toBe("google_refresh");
    expect(canonicalTokenName("google_refresh")).toBe("google_refresh");
    expect(canonicalTokenName("GOOGLE_REFRESH")).toBe("google_refresh");
  });

  it("accepts a name of exactly 128 characters", () => {
    expect(canonicalTokenName(`a${"b".repeat(127)}`)).toHaveLength(128);
  });

  it("throws RangeError for a name that breaks the rule", () => {
    for (const name of [
      "",
      "1token",
      "_token",
      "to ken",
      "token.key",
      "tökén",
      `a${"b".repeat(128)}`,
    ]) {
      expect(() => canonicalTokenName(name)).toThrow(RangeError);
    }
  });

  it("gives the same canonical form as the desktop shell for every shared case", () => {
    const cases = readSharedCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const { name, expected } of cases) {
      if (expected === "INVALID") {
        expect(() => canonicalTokenName(name), JSON.stringify(name)).toThrow(RangeError);
      } else {
        expect(canonicalTokenName(name), JSON.stringify(name)).toBe(expected);
      }
    }
  });
});
