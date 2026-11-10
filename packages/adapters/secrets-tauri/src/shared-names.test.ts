import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { TauriSecrets } from "./tauri-secrets.ts";

/**
 * The cases the shell checks its own names against (`SecretName::parse`).
 * Each line is a name, a tab, then its canonical form or `INVALID`. Its path
 * is also a test input in this package's `turbo.json`, so a change to it
 * re-runs this test.
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

verifies("secrets-tauri.shared-names", () => {
  it("refuses exactly the names the shell refuses, and sends the rest", async () => {
    const cases = readSharedCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const { name, expected } of cases) {
      const shell = new FakeShell();
      const lookup = new TauriSecrets(shell).get(name);
      if (expected === "INVALID") {
        await expect(lookup, JSON.stringify(name)).rejects.toThrow(RangeError);
        expect(shell.calls, JSON.stringify(name)).toEqual([]);
      } else {
        expect(await lookup, name).toBeNull();
        expect(shell.calls, name).toEqual([{ command: "secret_get", args: { name } }]);
        // Keeps the fake honest: it stores the name the way the shell does.
        await new TauriSecrets(shell).set(name, "value");
        expect([...shell.entries.keys()], name).toEqual([expected]);
      }
    }
  });
});
