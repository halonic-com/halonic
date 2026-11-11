import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * Attack case A36 on the real Seatbelt fence: `security` asks securityd over
 * Mach for a Keychain item, so the file fence has no say in it. srt always
 * allows those services; a profile with `keyStore: "denied"` gets them denied
 * by our patch of srt. The keychain sits in a folder the fence lets the
 * program read and goes on the user's search list, so the program asks for
 * the item by name and never names the file. The CI runner is thrown away
 * after the job; `afterAll` still puts the list back.
 */
const isMac = process.platform === "darwin";
const sandbox = new SrtSandbox();
const service = "halonic-fence-srt-keychain";
const canary = `canary-${randomUUID()}`;

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

/** The user's keychain search list, as `security list-keychains` prints it: one quoted path a line. */
function userSearchList(): string[] {
  return execFileSync("security", ["list-keychains", "-d", "user"], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim().replace(/^"(.*)"$/, "$1"))
    .filter((path) => path !== "");
}

describe.skipIf(!isMac)("a program in the fence asking the macOS Keychain (A36)", () => {
  let base: string;
  let keychain: string | undefined;
  let searchList: string[] | undefined;

  const profile = (keyStore: "allowed" | "denied"): SandboxProfile => ({
    workingFolder: join(base, "work"),
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 60_000,
    keyStore,
  });

  /** Runs `security find-generic-password` for the item in a fresh session with this profile. */
  async function askKeychain(keyStore: "allowed" | "denied") {
    const session = await sandbox.open(profile(keyStore));
    try {
      const started = await session.start({
        program: "/usr/bin/security",
        args: ["find-generic-password", "-w", "-s", service],
      });
      const [out, exit] = await Promise.all([read(started.stdout), started.exited]);
      return { out, code: exit.code };
    } finally {
      await session.close();
    }
  }

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "srt-keychain-"));
    await mkdir(join(base, "work"), { recursive: true });
    const created = join(base, "attack.keychain-db");
    const password = randomUUID();
    execFileSync("security", ["create-keychain", "-p", password, created]);
    // Set only once it exists, so `afterAll` doesn't delete a missing keychain and hide the error.
    keychain = created;
    execFileSync("security", [
      "add-generic-password",
      "-s",
      service,
      "-a",
      "halonic-ci",
      "-w",
      canary,
      "-T",
      "/usr/bin/security",
      keychain,
    ]);
    searchList = userSearchList();
    execFileSync("security", ["list-keychains", "-d", "user", "-s", ...searchList, keychain]);
    // Outside the fence the item comes back, so a refusal inside is the fence's doing.
    const outside = execFileSync("security", ["find-generic-password", "-w", "-s", service], {
      encoding: "utf8",
    });
    expect(outside.trim()).toBe(canary);
  });

  afterAll(async () => {
    if (searchList) {
      execFileSync("security", ["list-keychains", "-d", "user", "-s", ...searchList]);
    }
    if (keychain) execFileSync("security", ["delete-keychain", keychain]);
    await rm(base, { recursive: true, force: true });
  });

  it("gets the item when the profile allows the key store, as srt does by default", async () => {
    const { out, code } = await askKeychain("allowed");
    expect({ out: out.trim(), code }).toEqual({ out: canary, code: 0 });
  });

  it("gets no item when the profile denies the key store", async () => {
    const { out, code } = await askKeychain("denied");
    expect(out).not.toContain(canary);
    expect(code).not.toBe(0);
  });
});
