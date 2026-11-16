import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeRunnerTempFolder } from "../src/runner-temp-folder.ts";

/**
 * The runner's temp folder on a real Windows machine (HAL-10674): in the
 * folder every account shares, `makeRunnerTempFolder` gives the current user a
 * folder only it may use. The folder holds one entry, for the current user,
 * inherits nothing, the current user can write in it, and a second local
 * account can neither list it nor write in it. Run by the `sandbox-windows` CI
 * job (`vitest.fence-windows.config.ts`), whose runner account is an
 * administrator and may create the second account.
 */
/** The exit code of a failed `execFile`, or -1 when it never started. */
function exitCode(error: (Error & { code?: unknown }) | null): number {
  if (error === null) return 0;
  return typeof error.code === "number" ? error.code : -1;
}

function run(
  file: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, env }, (error, stdout, stderr) => {
      resolve({ code: exitCode(error), stdout, stderr });
    });
  });
}

const other = "halonic_tmp_probe";
// A new password every run, so a leftover account never has a known one.
const otherPassword = `Aa1!${randomBytes(4).toString("hex")}`;

/** Runs a command line as the second account; its exit code, or -1 when it could not start. */
async function asOther(commandLine: string): Promise<number> {
  const script = `
$ErrorActionPreference = 'Stop'
$p = New-Object System.Diagnostics.Process
$p.StartInfo.FileName = "$env:SystemRoot\\System32\\cmd.exe"
$p.StartInfo.Arguments = '/c ' + $env:PROBE_COMMAND
$p.StartInfo.UserName = '${other}'
$p.StartInfo.Password = (ConvertTo-SecureString $env:PROBE_PASSWORD -AsPlainText -Force)
$p.StartInfo.Domain = $env:COMPUTERNAME
$p.StartInfo.WorkingDirectory = "$env:SystemRoot\\System32"
$p.StartInfo.UseShellExecute = $false
$p.StartInfo.LoadUserProfile = $false
$p.Start() | Out-Null
$p.WaitForExit()
exit $p.ExitCode`;
  const { code } = await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      ...process.env,
      PROBE_COMMAND: commandLine,
      PROBE_PASSWORD: otherPassword,
    },
  );
  return code;
}

describe("the runner's temp folder on Windows", () => {
  let base: string;
  let folder: string;

  beforeAll(async () => {
    // The folder every account shares: under the temp folder here, readable by the other account like %ProgramData% is.
    base = await mkdtemp(join(tmpdir(), "halonic-runner-temp-"));
    await run("net.exe", ["user", other, "/delete"]); // a leftover from an earlier run, if any
    const added = await run("net.exe", ["user", other, otherPassword, "/add"]);
    expect(added.code, `net user: ${added.stdout} ${added.stderr}`).toBe(0);
    folder = await makeRunnerTempFolder(join(base, "runner-temp"));
  }, 60_000);

  afterAll(async () => {
    await run("net.exe", ["user", other, "/delete"]);
    await rm(base, { recursive: true, force: true });
  });

  it("lets only the current user into the run's folder, and nothing is inherited from the shared folder", async () => {
    const { code, stdout } = await run("icacls.exe", [folder]);
    expect(code).toBe(0);
    const entries = stdout
      .split(/\r?\n/)
      .filter((line) => /:\(/.test(line))
      .map((line) => line.trim().toLowerCase());
    expect(entries, stdout).toHaveLength(1);
    expect(entries[0]).toContain((process.env["USERNAME"] ?? "").toLowerCase());
    for (const group of ["users", "everyone", "authenticated users"]) {
      expect(entries[0], group).not.toContain(`\\${group}:`);
    }
  });

  it("lets the current user write in it", async () => {
    const { code, stdout } = await run("cmd.exe", [
      "/c",
      `echo ok > "${join(folder, "scratch.txt")}"`,
    ]);
    expect(code, stdout).toBe(0);
  });

  it("is reachable by another local account neither to read nor to write", async () => {
    expect(await asOther("exit 0")).toBe(0); // the account works at all
    expect(await asOther(`dir "${folder}"`)).not.toBe(0);
    expect(await asOther(`echo x > "${join(folder, "planted.txt")}"`)).not.toBe(0);
  });
});
