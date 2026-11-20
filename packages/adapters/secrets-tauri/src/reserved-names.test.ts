import { readFileSync } from "node:fs";
import { halonicSecretNames, hostSecretNames } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { TauriSecrets } from "./tauri-secrets.ts";

/**
 * The names the shell refuses to the secret commands (`HALONIC_NAMES`), in
 * canonical form, one per line. Its path is also a test input in this
 * package's `turbo.json`, so a change to it re-runs this test.
 */
const reservedNames = new URL(
  "../../../../apps/studio/src-tauri/crates/secrets/tests/fixtures/reserved-names.txt",
  import.meta.url,
);

function readReservedNames(): string[] {
  return readFileSync(reservedNames, "utf8")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** A name as the shell stores it: lower case, with `-` as `_`. */
const canonical = (name: string) => name.toLowerCase().replaceAll("-", "_");

verifies("secrets-tauri.reserved-names", () => {
  it("reserves the same names as the shell", () => {
    const ports = [...halonicSecretNames, ...hostSecretNames].map(canonical).sort();
    expect(ports).toEqual(readReservedNames().sort());
    expect(hostSecretNames).toContain("remote-host-key");
  });

  it("has a fake shell that refuses each of them, as the shell does", async () => {
    for (const name of readReservedNames()) {
      const shell = new FakeShell();
      await expect(new TauriSecrets(shell).get(name), name).rejects.toThrow(RangeError);
    }
  });
});
