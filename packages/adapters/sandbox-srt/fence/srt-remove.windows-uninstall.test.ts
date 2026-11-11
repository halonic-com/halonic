import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getWindowsSandboxUserStatusAsync,
  getWindowsWfpStatusAsync,
  resolveSrtWin,
  VENDORED_SRT_WIN_EXE,
} from "@anthropic-ai/sandbox-runtime";
import type { SandboxProfile } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * Removing the sandbox on a real Windows machine (HAL-6180): what the
 * uninstaller's `--sandbox-remove` runs. Run by the `sandbox-windows` CI job
 * as its last step (`vitest.remove-windows.config.ts`), after the fence tests,
 * because it takes srt's install away. The runner's account is an
 * administrator, so the uninstall needs no prompt.
 */
const sandbox = new SrtSandbox();
const srtWin = resolveSrtWin({ path: VENDORED_SRT_WIN_EXE });

/** The access list of `path`, as `icacls` prints it. */
function accessList(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("icacls", [path], (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

describe("SrtSandbox.remove on Windows", () => {
  let base: string;
  let work: string;
  let groupSid: string | undefined;

  const profile = (): SandboxProfile => ({
    workingFolder: work,
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  beforeAll(async () => {
    base = await mkdtemp(join(process.env["RUNNER_TEMP"] ?? tmpdir(), "srt-remove-"));
    work = join(base, "work");
    await mkdir(work, { recursive: true });
    groupSid = (await getWindowsSandboxUserStatusAsync({ srtWin })).groupSid;
    // A session on the working folder, so the removal has its grants to take off too.
    const session = await sandbox.open(profile());
    await session.close();
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("starts from a working install", async () => {
    expect(await sandbox.check()).toEqual({ ok: true, reason: null, missing: [] });
    expect(groupSid).toMatch(/^S-1-5-21-/);
  });

  it("removes nothing while a sandboxed program runs, and says why", async () => {
    const session = await sandbox.open(profile());
    try {
      const script = join(work, "wait.cjs");
      await writeFile(script, 'console.log("running");\nsetTimeout(() => {}, 60000);\n');
      const started = await session.start({ program: process.execPath, args: [script] });
      // Wait until it runs inside the fence, so srt sees it.
      await started.stdout.getReader().read();
      const removal = await sandbox.remove();
      expect(removal.ok).toBe(false);
      expect(removal.ok ? "" : removal.reason).not.toBe("");
      expect((await sandbox.check()).ok).toBe(true);
      await started.kill();
    } finally {
      await session.close();
    }
  });

  it("removes the account, its group, the network filters and srt's machine key", async () => {
    expect(await sandbox.remove()).toEqual({ ok: true });
    expect(await sandbox.check()).toMatchObject({ ok: false, reason: "setup-needed" });
    const user = await getWindowsSandboxUserStatusAsync({ srtWin });
    expect(user).toMatchObject({ provisioned: false, groupExists: false, credPresent: false });
    expect(user.markerVersion).toBeUndefined();
    expect(user.persistentGrants).toBeUndefined();
    expect(await getWindowsWfpStatusAsync({ srtWin })).toMatchObject({
      state: "absent",
      filters: 0,
    });
  });

  it("leaves no entry for the sandbox on the folder a session worked in", async () => {
    const list = await accessList(work);
    expect(list).not.toContain(groupSid);
    expect(list).not.toMatch(/srt-sandbox|sandbox-runtime-users/i);
  });

  it("is done again when nothing is left to remove", async () => {
    expect(await sandbox.remove()).toEqual({ ok: true });
  });
});
