import { mkdir, mkdtemp, readdir, realpath, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { RunProgram } from "./journal-acl.ts";
import { accountFolderName, makeRunnerTempFolder } from "./runner-temp-folder.ts";

const sid = "S-1-5-21-1-2-3-1001";
const otherSid = "S-1-5-21-1-2-3-1002";

/** What the fake PowerShell prints for a folder that is private to `sid`. */
function accessOf(
  who: { owner?: string; protectedFromParent?: boolean; rules?: string[] } = {},
): string {
  const {
    owner = sid,
    protectedFromParent = true,
    rules = [`rule ${sid} Allow False FullControl`],
  } = who;
  return [`owner ${owner}`, `protected ${protectedFromParent ? "True" : "False"}`, ...rules].join(
    "\r\n",
  );
}

/** A fake `whoami`, `icacls` and PowerShell that records its calls; `access` is what PowerShell prints, or a failure. */
function fakePrograms(access: string | Error = accessOf(), failing: string[] = []) {
  const calls: { file: string; args: string[] }[] = [];
  const start: RunProgram = async (file, args) => {
    calls.push({ file, args });
    if (failing.includes(args[1] ?? "")) throw new Error("Access is denied");
    if (file.endsWith("powershell.exe")) {
      if (access instanceof Error) throw access;
      return { stdout: access };
    }
    return { stdout: `"corp\\acme","${sid}"\r\n` };
  };
  const icacls = () => calls.filter((call) => call.file === "icacls.exe");
  return { calls, icacls, start };
}

let base: string;
let shared: string;
let privateParent: string;
let notes: string[];
const log = (text: string) => notes.push(text);

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "runner-temp-")));
  shared = join(base, "ProgramData");
  privateParent = join(base, "profile", "runner-temp");
  await mkdir(shared);
  notes = [];
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const account = () => join(shared, accountFolderName(sid));

verifies("sandbox-srt.runner-temp-folder", () => {
  it("makes a folder in the account's own hashed folder in the shared one, and restricts a folder it made", async () => {
    const { icacls, start } = fakePrograms();
    const folder = await makeRunnerTempFolder(
      { privateParent, sharedParent: shared },
      { platform: "win32", start, log },
    );
    expect(dirname(folder)).toBe(account());
    expect(basename(folder)).toMatch(/^r-/);
    expect(account()).not.toContain("acme");
    const restricted = icacls().filter((call) => call.args[1] === "/inheritance:r");
    expect(restricted.map((call) => call.args[0])).toEqual([account()]);
    expect(notes).toEqual([]);
  });

  it("uses an account folder that is already private to the user, without changing it", async () => {
    const { icacls, start } = fakePrograms();
    await mkdir(account());
    const places = { privateParent, sharedParent: shared };
    const first = await makeRunnerTempFolder(places, { platform: "win32", start, log });
    const second = await makeRunnerTempFolder(places, { platform: "win32", start, log });
    expect(dirname(first)).toBe(account());
    expect(dirname(second)).toBe(account());
    expect(second).not.toBe(first);
    expect(icacls()).toEqual([]);
    expect(notes).toEqual([]);
  });

  it.each([
    ["owned by another account", accessOf({ owner: otherSid }), "another account owns it"],
    [
      "taking its access list from the folder above",
      accessOf({ protectedFromParent: false }),
      "from the folder above",
    ],
    [
      "holding an entry of the account that made it",
      accessOf({
        rules: [`rule ${sid} Allow False FullControl`, `rule ${otherSid} Allow False FullControl`],
      }),
      "not exactly one entry",
    ],
    ["with no entry at all", accessOf({ rules: [] }), "not exactly one entry"],
    [
      "with an entry for another account only",
      accessOf({ rules: [`rule ${otherSid} Allow False FullControl`] }),
      "not full control for this user",
    ],
    [
      "with a user's entry inherited",
      accessOf({ rules: [`rule ${sid} Allow True FullControl`] }),
      "not full control for this user",
    ],
    [
      "with less than full control",
      accessOf({ rules: [`rule ${sid} Allow False Modify, Synchronize`] }),
      "not full control for this user",
    ],
  ])(
    "refuses an account folder that is %s, and makes the folder in the profile instead",
    async (_name, access, reason) => {
      const { icacls, start } = fakePrograms(access);
      await mkdir(account());
      const folder = await makeRunnerTempFolder(
        { privateParent, sharedParent: shared },
        { platform: "win32", start, log },
      );
      expect(dirname(folder)).toBe(privateParent);
      expect(await readdir(account())).toEqual([]);
      expect(icacls()).toEqual([]);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toContain(reason);
      expect(notes[0]).toContain("profile folder");
      expect(notes[0]).not.toContain("acme");
    },
  );

  it("refuses an account folder whose access list can't be read", async () => {
    const { start } = fakePrograms("something else");
    await mkdir(account());
    const folder = await makeRunnerTempFolder(
      { privateParent, sharedParent: shared },
      { platform: "win32", start, log },
    );
    expect(dirname(folder)).toBe(privateParent);
    expect(notes[0]).toContain("could not be read");
  });

  it("refuses a link where the account folder should be, and leaves its target alone", async () => {
    const { icacls, start } = fakePrograms();
    const target = join(base, "elsewhere");
    await mkdir(target);
    await symlink(target, account(), "junction");
    const folder = await makeRunnerTempFolder(
      { privateParent, sharedParent: shared },
      { platform: "win32", start, log },
    );
    expect(dirname(folder)).toBe(privateParent);
    expect(await readdir(target)).toEqual([]);
    expect(icacls()).toEqual([]);
    expect(notes[0]).toContain("link or junction");
  });

  it("takes the folder away again when it made it and could not restrict it", async () => {
    const { start } = fakePrograms(accessOf(), ["/setowner"]);
    const folder = await makeRunnerTempFolder(
      { privateParent, sharedParent: shared },
      { platform: "win32", start, log },
    );
    expect(dirname(folder)).toBe(privateParent);
    expect(await readdir(shared)).toEqual([]);
    expect(notes[0]).toContain("Access is denied");
  });

  it("refuses a folder it just restricted when the access list read back is not private", async () => {
    const { start } = fakePrograms(accessOf({ owner: otherSid }));
    const folder = await makeRunnerTempFolder(
      { privateParent, sharedParent: shared },
      { platform: "win32", start, log },
    );
    expect(dirname(folder)).toBe(privateParent);
    expect(await readdir(shared)).toEqual([]);
  });

  it("makes the folder in the profile, and says so, when there is no shared folder", async () => {
    const { calls, start } = fakePrograms();
    const folder = await makeRunnerTempFolder({ privateParent }, { platform: "win32", start, log });
    expect(dirname(folder)).toBe(privateParent);
    expect(notes[0]).toContain("ProgramData");
    expect(calls).toEqual([]);
  });

  it("names the account's folder without anything of the account", () => {
    expect(accountFolderName(sid)).toMatch(/^halonic-runner-[0-9a-f]{16}$/);
    expect(accountFolderName(sid)).toBe(accountFolderName(sid));
    expect(accountFolderName(sid)).not.toBe(accountFolderName(otherSid));
  });

  it("makes a folder in the private parent where there are no access lists to set", async () => {
    const folder = await makeRunnerTempFolder(
      { privateParent, sharedParent: shared },
      { platform: "linux", log },
    );
    expect(dirname(folder)).toBe(privateParent);
    expect(await readdir(shared)).toEqual([]);
    expect(notes).toEqual([]);
  });

  it.skipIf(process.platform === "win32")(
    "[platform:win32] mode bits do nothing there: the private parent and the folder get mode 0700",
    async () => {
      const folder = await makeRunnerTempFolder({ privateParent }, { platform: "linux" });
      expect((await stat(folder)).mode & 0o777).toBe(0o700);
      expect((await stat(privateParent)).mode & 0o777).toBe(0o700);
    },
  );
});
