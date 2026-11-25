import { readFileSync } from "node:fs";
import {
  halonicSecretNames,
  hostSecretNames,
  isHalonicSecretName,
  isSecretName,
  isServerPairingSecretName,
} from "@halonicjs/ports";
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

/**
 * The shell's shared cases for server pairings (HAL-18501): the name, what the host's channel does
 * with it, and what the page's commands do with it. The shell's `tests/pairing.rs` reads the same
 * file, and it is a test input in this package's `turbo.json` too.
 */
const serverPairingNames = new URL(
  "../../../../apps/studio/src-tauri/crates/secrets/tests/fixtures/server-pairing-names.tsv",
  import.meta.url,
);

function readServerPairingCases(): { name: string; host: string; page: string }[] {
  return readFileSync(serverPairingNames, "utf8")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const [name = "", host = "", page = ""] = line.split("\t");
      return { name, host, page };
    });
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

  it("reads server pairing names as the shell does", async () => {
    const cases = readServerPairingCases();
    expect(cases).toHaveLength(16);
    for (const { name, host, page } of cases) {
      expect(isServerPairingSecretName(name), name).toBe(host === "accept");
      expect(isSecretName(name), name).toBe(page !== "invalid");
      if (page === "invalid") continue;
      expect(isHalonicSecretName(name), name).toBe(page === "reserved");
      if (page !== "reserved") continue;
      const shell = new FakeShell();
      await expect(new TauriSecrets(shell).get(name), name).rejects.toThrow(RangeError);
    }
  });
});
