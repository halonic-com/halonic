import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { currentUserSid } from "../src/journal-acl.ts";
import { removeFolder } from "../src/remove-folder.ts";
import { accountFolderName, makeRunnerTempFolder } from "../src/runner-temp-folder.ts";

/**
 * The runner's temp folder on a real Windows machine (HAL-10674). The shared
 * folder is made in `%ProgramData%`, like the one Halonic uses, so a second
 * local account can read and make folders in it; a base in the CI user's own
 * profile could not be reached by that account at all, and a denial there
 * would prove nothing. Every denial is paired with a control that shows the
 * same account can do the same thing where it is allowed.
 *
 * - `makeRunnerTempFolder` gives the current user a folder only it may use:
 *   one entry, for the current user, nothing inherited.
 * - A second local account can neither list it nor write in it.
 * - When that account made the user's account folder first, with an entry of
 *   its own and the user's full control (which includes taking the ownership),
 *   the folder is refused and the temp folder is made in the profile.
 *
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

/** What a command line run as the second account ended with. */
interface AsOther {
  /** Its exit code, or -1 when it could not start. */
  code: number;
  /** What it and the script around it printed, to put in an assertion's message. */
  output: string;
}

/** Runs a command line (`cmd /c`) as the second account. */
async function asOther(commandLine: string): Promise<AsOther> {
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
$p.StartInfo.RedirectStandardOutput = $true
$p.StartInfo.RedirectStandardError = $true
$p.Start() | Out-Null
$out = $p.StandardOutput.ReadToEnd() + $p.StandardError.ReadToEnd()
$p.WaitForExit()
Write-Output $out
exit $p.ExitCode`;
  const { code, stdout, stderr } = await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { ...process.env, PROBE_COMMAND: commandLine, PROBE_PASSWORD: otherPassword },
  );
  return { code, output: `${commandLine}: ${stdout} ${stderr}`.trim() };
}

/** `icacls` entries of a folder, one lower-cased line each. */
async function entriesOf(folder: string): Promise<string[]> {
  const { code, stdout } = await run("icacls.exe", [folder]);
  expect(code, stdout).toBe(0);
  return stdout
    .split(/\r?\n/)
    .filter((line) => /:\(/.test(line))
    .map((line) => line.trim().toLowerCase());
}

const programData = process.env["ProgramData"] ?? "";

describe("the runner's temp folder on Windows", () => {
  /** Stands for %ProgramData%: made there by the administrator, so it has the access lists a folder there has. */
  let shared: string;
  let privateParent: string;
  let profileBase: string;
  let folder: string;
  let account: string;
  let notes: string[];
  let sid: string;

  /** Makes the second account able to make folders in `parent`, as the `Users` group can in `%ProgramData%`. */
  async function letOtherMakeFolders(parent: string): Promise<void> {
    const granted = await run("icacls.exe", [parent, "/grant", `${other}:(M)`]);
    expect(granted.code, `icacls: ${granted.stdout} ${granted.stderr}`).toBe(0);
  }

  beforeAll(async () => {
    expect(programData, "ProgramData is set").not.toBe("");
    // The real path: tmpdir() may spell the profile with a short name (RUNNER~1) that the made folder does not.
    profileBase = await realpath(await mkdtemp(join(tmpdir(), "halonic-runner-profile-")));
    privateParent = join(profileBase, "runner-temp");
    shared = await mkdtemp(join(programData, "halonic-fence-"));
    await run("net.exe", ["user", other, "/delete"]); // a leftover from an earlier run, if any
    const added = await run("net.exe", ["user", other, otherPassword, "/add"]);
    expect(added.code, `net user: ${added.stdout} ${added.stderr}`).toBe(0);
    await letOtherMakeFolders(shared);
    sid = await currentUserSid();
    account = join(shared, accountFolderName(sid));
    notes = [];
    folder = await makeRunnerTempFolder(
      { privateParent, sharedParent: shared },
      { log: (text) => notes.push(text) },
    );
  }, 60_000);

  afterAll(async () => {
    await run("net.exe", ["user", other, "/delete"]);
    await removeFolder(profileBase);
    await removeFolder(shared);
  });

  it("makes the run's folder in the account's own folder in the shared folder", () => {
    expect(notes).toEqual([]);
    expect(folder.toLowerCase().startsWith(`${account.toLowerCase()}\\r-`)).toBe(true);
  });

  it("lets only the current user into the account's folder and the run's folder, and nothing is inherited", async () => {
    for (const path of [account, folder]) {
      const entries = await entriesOf(path);
      expect(entries, path).toHaveLength(1);
      expect(entries[0]).toContain((process.env["USERNAME"] ?? "").toLowerCase());
      for (const group of ["users", "everyone", "authenticated users"]) {
        expect(entries[0], group).not.toContain(`\\${group}:`);
      }
    }
  });

  it("lets the current user write in it", async () => {
    await writeFile(join(folder, "scratch.txt"), "ok");
    expect(await readdir(folder)).toContain("scratch.txt");
  });

  it("is reachable by another local account neither to read nor to write, where that account can reach the shared folder", async () => {
    const works = await asOther("exit 0");
    expect(works.code, works.output).toBe(0); // the account works at all
    // The controls: the same account lists the shared folder and makes a folder of its own in it.
    const lists = await asOther(`dir "${shared}"`);
    expect(lists.code, lists.output).toBe(0);
    const makes = await asOther(`mkdir "${join(shared, "control-folder")}"`);
    expect(makes.code, makes.output).toBe(0);
    // The attacks.
    for (const path of [account, folder]) {
      const reads = await asOther(`dir "${path}"`);
      expect(reads.code, reads.output).not.toBe(0);
    }
    const writes = await asOther(`echo x > "${join(folder, "planted.txt")}"`);
    expect(writes.code, writes.output).not.toBe(0);
    expect(await readdir(folder)).not.toContain("planted.txt");
  });

  it("refuses an account folder another account made first, with its own entry and the user's full control", async () => {
    const planted = await mkdtemp(join(programData, "halonic-fence-"));
    try {
      await letOtherMakeFolders(planted);
      const plantedAccount = join(planted, accountFolderName(sid));
      const plantedByOther = await asOther(
        `mkdir "${plantedAccount}" && icacls "${plantedAccount}" /grant ${other}:(OI)(CI)F /grant *${sid}:(OI)(CI)F`,
      );
      expect(plantedByOther.code, plantedByOther.output).toBe(0);
      const otherNotes: string[] = [];
      const fallback = join(profileBase, "fallback-runner-temp");
      const made = await makeRunnerTempFolder(
        { privateParent: fallback, sharedParent: planted },
        { log: (text) => otherNotes.push(text) },
      );
      const where = `made ${made}, notes ${JSON.stringify(otherNotes)}`;
      expect(
        made.toLowerCase().startsWith(`${plantedAccount.toLowerCase()}\\`),
        `used the planted folder: ${where}`,
      ).toBe(false);
      expect(
        made.toLowerCase().startsWith(`${fallback.toLowerCase()}\\`),
        `not in the fallback: ${where}`,
      ).toBe(true);
      expect(otherNotes, where).toHaveLength(1);
      expect(otherNotes[0]).toContain("not private");
      // Nothing of the run went into the planted folder, and its entry was not carried anywhere.
      expect(await readdir(plantedAccount)).toEqual([]);
      expect((await entriesOf(made)).join("\n")).not.toContain(other);
    } finally {
      await removeFolder(planted);
    }
  });
});
