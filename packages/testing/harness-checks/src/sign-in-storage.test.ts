import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { claudeSignInStorage, type Keychain, keychainServiceNames } from "./sign-in-storage.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-sign-in-storage-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const noKeychain: Keychain = { serviceNames: async () => null };

/** Part of what `security dump-keychain` prints, with made-up entries. */
const dump = [
  'class: "genp"',
  "attributes:",
  '    "acct"<blob>="someone"',
  '    "svce"<blob>="Claude Code-credentials"',
  'class: "genp"',
  "attributes:",
  '    "svce"<blob>="Wi-Fi"',
  '    "svce"<blob>="Claude Code-credentials-1a2b3c4d"',
  '    "svce"<blob>=<NULL>',
].join("\n");

verifies("harness-checks.sign-in-storage", () => {
  it("finds .credentials.json in the settings folder", async () => {
    await writeFile(join(folder, ".credentials.json"), "{}");

    expect(await claudeSignInStorage(folder, noKeychain)).toEqual({
      credentialsFile: "present",
      keychainServices: null,
    });
  });

  it("says the file is absent when the folder has none", async () => {
    expect((await claudeSignInStorage(folder, noKeychain)).credentialsFile).toBe("absent");
  });

  it("lists only the Keychain entries named after Claude Code", async () => {
    const keychain: Keychain = { serviceNames: async () => keychainServiceNames(dump) };

    expect((await claudeSignInStorage(folder, keychain)).keychainServices).toEqual([
      "Claude Code-credentials",
      "Claude Code-credentials-1a2b3c4d",
    ]);
  });

  it("reads service names, never an account, from the Keychain's dump", () => {
    expect(keychainServiceNames(dump)).toEqual([
      "Claude Code-credentials",
      "Wi-Fi",
      "Claude Code-credentials-1a2b3c4d",
    ]);
  });
});
