import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareJournalFolder } from "../src/git-folder-check.ts";

/**
 * The journal folder's access list on a real Windows machine (HAL-3896):
 * after `prepareJournalFolder` only the current user is in it, nothing is
 * inherited, and a second local account can neither list nor write in it.
 * Run by the `sandbox-windows` CI job (`vitest.fence-windows.config.ts`), whose
 * runner account is an administrator and may create the second account.
 */
/** The exit code of a failed `execFile`, or -1 when it never started. */
function exitCode(error: (Error & { code?: unknown }) | null): number {
  if (error === null) return 0;
  return typeof error.code === "number" ? error.code : -1;
}

function run(
  file: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ code: exitCode(error), stdout, stderr });
    });
  });
}

const other = "halonic_acl_probe";
// A new password every run, so a leftover account never has a known one. The
// fixed prefix meets the complexity rules; 12 characters stays under the
// 14-character limit of `net user`.
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
  const result = await new Promise<number>((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        env: {
          ...process.env,
          PROBE_COMMAND: commandLine,
          PROBE_PASSWORD: otherPassword,
        },
      },
      (error) => resolve(exitCode(error)),
    );
  });
  return result;
}

describe("the journal folder on Windows", () => {
  let base: string;
  let folder: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "halonic-journal-acl-"));
    folder = join(base, "sandbox-journals");
    await run("net.exe", ["user", other, "/delete"]); // a leftover from an earlier run, if any
    const added = await run("net.exe", ["user", other, otherPassword, "/add"]);
    expect(added.code, `net user: ${added.stdout} ${added.stderr}`).toBe(0);
    await prepareJournalFolder(folder);
  }, 60_000);

  afterAll(async () => {
    await run("net.exe", ["user", other, "/delete"]);
    await rm(base, { recursive: true, force: true });
  });

  it("holds one entry, for the current user, and inherits nothing", async () => {
    const { code, stdout } = await run("icacls.exe", [folder]);
    expect(code).toBe(0);
    const entries = stdout
      .split(/\r?\n/)
      .filter((line) => /:\(/.test(line))
      .map((line) => line.trim());
    expect(entries, stdout).toHaveLength(1);
    expect(entries[0]).not.toContain("(I)");
    expect(entries[0]?.toLowerCase()).toContain((process.env["USERNAME"] ?? "").toLowerCase());
  });

  it("is owned by the current user", async () => {
    const { code, stdout } = await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-Acl -LiteralPath '${folder}').Owner`,
    ]);
    expect(code).toBe(0);
    const owner = stdout.trim().toLowerCase();
    expect(owner.endsWith(`\\${(process.env["USERNAME"] ?? "").toLowerCase()}`), owner).toBe(true);
  });

  it("is taken over when another account owns it, with the access list still reset", async () => {
    const owned = join(base, "owned-by-other");
    await mkdir(owned);
    // Give it to the second account; the runner is an administrator and may.
    const given = await run("icacls.exe", [owned, "/setowner", other]);
    expect(given.code, `${given.stdout} ${given.stderr}`).toBe(0);
    await prepareJournalFolder(owned);
    const { stdout } = await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-Acl -LiteralPath '${owned}').Owner`,
    ]);
    expect(stdout.trim().toLowerCase()).not.toContain(other);
    expect(await asOther(`dir "${owned}"`)).not.toBe(0);
  });

  it("is reachable by another local account neither to read nor to write", async () => {
    expect(await asOther("exit 0")).toBe(0); // the account works at all
    expect(await asOther(`dir "${folder}"`)).not.toBe(0);
    expect(await asOther(`echo x > "${join(folder, "planted.json")}"`)).not.toBe(0);
  });
});
