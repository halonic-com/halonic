import { mkdir, mkdtemp, readdir, realpath, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { RunProgram } from "./journal-acl.ts";
import { accountFolderName, makeRunnerTempFolder } from "./runner-temp-folder.ts";

const sid = "S-1-5-21-1-2-3-1001";

/** A fake `whoami` and `icacls` that records its calls and fails the ones `failing` names. */
function fakePrograms(failing: string[] = []) {
  const calls: { file: string; args: string[] }[] = [];
  const start: RunProgram = async (file, args) => {
    calls.push({ file, args });
    if (failing.includes(args[1] ?? "")) throw new Error("Access is denied");
    return { stdout: `"corp\\acme","${sid}"\r\n` };
  };
  return { calls, start };
}

let parent: string;

beforeEach(async () => {
  parent = join(await mkdtemp(join(tmpdir(), "runner-temp-")), "runner-temp");
});

afterEach(async () => {
  await rm(dirname(parent), { recursive: true, force: true });
});

verifies("sandbox-srt.runner-temp-folder", () => {
  it("makes a folder in the account's own hashed folder and restricts that folder to the user", async () => {
    const { calls, start } = fakePrograms();
    const folder = await makeRunnerTempFolder(parent, "win32", start);
    const account = join(parent, accountFolderName(sid));
    expect(dirname(folder)).toBe(await realpath(account));
    expect(basename(folder)).toMatch(/^r-/);
    expect(account).not.toContain("acme");
    const restricted = calls.filter(
      (call) => call.file === "icacls.exe" && call.args[1] === "/inheritance:r",
    );
    expect(restricted.map((call) => call.args[0])).toEqual([account]);
  });

  it("makes a second folder in the same account folder", async () => {
    const { start } = fakePrograms();
    const first = await makeRunnerTempFolder(parent, "win32", start);
    const second = await makeRunnerTempFolder(parent, "win32", start);
    expect(second).not.toBe(first);
    expect(dirname(second)).toBe(dirname(first));
  });

  it("refuses a link where the account folder should be, and leaves its target alone", async () => {
    const { calls, start } = fakePrograms();
    const target = join(dirname(parent), "elsewhere");
    await mkdir(target);
    await mkdir(parent, { recursive: true });
    await symlink(target, join(parent, accountFolderName(sid)), "junction");
    await expect(makeRunnerTempFolder(parent, "win32", start)).rejects.toThrow(
      "not a plain folder",
    );
    expect(calls.filter((call) => call.file === "icacls.exe")).toEqual([]);
  });

  it("refuses a link as the shared parent", async () => {
    const { start } = fakePrograms();
    const target = join(dirname(parent), "elsewhere");
    await mkdir(target);
    await symlink(target, parent, "junction");
    await expect(makeRunnerTempFolder(parent, "win32", start)).rejects.toThrow(
      "not a plain folder",
    );
  });

  it("makes no run folder when taking the ownership of an existing account folder fails", async () => {
    const { start } = fakePrograms(["/setowner"]);
    await mkdir(join(parent, accountFolderName(sid)), { recursive: true });
    await expect(makeRunnerTempFolder(parent, "win32", start)).rejects.toThrow("Access is denied");
    expect(await readdir(join(parent, accountFolderName(sid)))).toEqual([]);
  });

  it("names the account's folder without anything of the account", () => {
    expect(accountFolderName(sid)).toMatch(/^[0-9a-f]{16}$/);
    expect(accountFolderName(sid)).toBe(accountFolderName(sid));
    expect(accountFolderName(sid)).not.toBe(accountFolderName("S-1-5-21-1-2-3-1002"));
  });

  it.skipIf(process.platform === "win32")(
    "makes a folder with mode 0700 where there are mode bits",
    async () => {
      const folder = await makeRunnerTempFolder(parent, "linux");
      expect(dirname(folder)).toBe(await realpath(parent));
      expect((await stat(folder)).mode & 0o777).toBe(0o700);
      expect((await stat(parent)).mode & 0o777).toBe(0o700);
    },
  );
});
