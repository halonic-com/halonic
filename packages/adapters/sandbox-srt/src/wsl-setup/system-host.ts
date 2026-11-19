import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { release } from "node:os";
import { join } from "node:path";
import type { ProgramResult, WslDistro, WslHost, WslPolicy } from "./host.ts";
import type { WslRemoveHost } from "./remove.ts";

/** The `RunOnce` value Halonic's setup owns. */
const RUN_ONCE_NAME = "HalonicWslSetup";
const RUN_ONCE_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce";
const POLICY_KEY = "HKLM\\SOFTWARE\\Policies\\Microsoft\\WSL";
/** What Windows gives a program whose administrator prompt was turned down. */
const ERROR_CANCELLED = 1223;

/** Runs a program, never throws: `code` is `null` when it didn't start. */
export type Run = (file: string, args: string[]) => Promise<ProgramResult>;

/** WSL's output is UTF-16 with NULs unless told otherwise; both are read as text. */
export function decodeWslOutput(bytes: Buffer): string {
  const text = bytes.includes(0) ? bytes.toString("utf16le") : bytes.toString("utf8");
  return text.replace(/^\uFEFF/, "").replace(/\0/g, "");
}

/**
 * The environment for the programs the host starts: the person's own, but
 * without `WSLENV`, which names Windows variables `wsl.exe` copies into the
 * distro (as the Studio shell's launcher does, HAL-5407 W6). Windows names
 * are case-insensitive, so every spelling goes.
 */
export function programEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = Object.fromEntries(
    Object.entries(env).filter(([name]) => name.toUpperCase() !== "WSLENV"),
  );
  return { ...kept, WSL_UTF8: "1" };
}

/**
 * `SystemRoot` (or `windir`) when it is a folder on a drive (a letter, a
 * colon and a slash), with no `..` part; `null` otherwise. Checked as the Studio
 * shell's `wsl_exe` does, because the host names its programs by full path
 * and puts this one in an elevated PowerShell line.
 */
export function systemRootOf(env: NodeJS.ProcessEnv): string | null {
  const root = env["SystemRoot"] ?? env["windir"];
  if (root === undefined || !/^[A-Za-z]:[\\/]/.test(root)) return null;
  if (root.split(/[\\/]/).includes("..")) return null;
  return root;
}

/** A PowerShell string literal: in single quotes, a quote is written twice. */
function psQuote(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

/** What every program "returns" when `SystemRoot` isn't usable: nothing starts. */
const noSystemRoot: Run = async () => ({
  code: null,
  output: "SystemRoot isn't a folder on a drive, so no Windows program was started",
});

function systemRun(file: string, args: string[]): Promise<ProgramResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        encoding: "buffer",
        windowsHide: true,
        timeout: 30 * 60_000,
        env: programEnv(process.env),
      },
      (error, stdout, stderr) => {
        const output = decodeWslOutput(Buffer.concat([stdout, stderr]));
        if (error === null) return resolve({ code: 0, output });
        const code = (error as NodeJS.ErrnoException).code;
        resolve({
          code: typeof code === "number" ? code : null,
          output: output || String(error.message),
        });
      },
    );
  });
}

/**
 * Reads `wsl --list --verbose`: a header line, then `* halonic  Running  2`
 * per distro. The state is translated and can be more than one word, such as
 * German `Wird ausgeführt`, so it is whatever stands between the name and the version.
 */
export function parseDistroList(text: string): WslDistro[] {
  const distros: WslDistro[] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const found = /^\s*(\*)?\s*(\S+)\s+(\S.*?)\s+([12])\s*$/.exec(line);
    if (found?.[2] === undefined || found[3] === undefined) continue;
    distros.push({
      name: found[2],
      state: found[3],
      version: found[4] === "1" ? 1 : 2,
      isDefault: found[1] === "*",
    });
  }
  return distros;
}

/** Reads `reg query ... /v <name>`'s `REG_DWORD 0x0` as a number. */
export function parseRegDword(text: string): number | undefined {
  const found = /REG_DWORD\s+(0x[0-9a-f]+)/i.exec(text);
  return found?.[1] === undefined ? undefined : Number(found[1]);
}

/**
 * The real Windows host. `run` is only for tests of this file.
 *
 * Elevation goes through PowerShell's `Start-Process -Verb RunAs`, so the
 * administrator prompt is Windows' own and the elevated program's text isn't
 * captured: `code` is its exit code, and the setup asks `wsl --status` after.
 * When `SystemRoot` isn't a folder on a drive, nothing starts: every program
 * ends with `code: null`, so the setup fails closed.
 */
export function systemWslHost(given: Run = systemRun): WslHost {
  const root = systemRootOf(process.env);
  const run = root === null ? noSystemRoot : given;
  const system32 = join(root ?? "", "System32");
  const wsl = join(system32, "wsl.exe");
  const reg = join(system32, "reg.exe");
  const powershell = join(system32, "WindowsPowerShell", "v1.0", "powershell.exe");
  const psArgs = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];

  const elevated = async (...args: string[]) => {
    const list = args.map(psQuote).join(",");
    const script = `try { $p = Start-Process -FilePath ${psQuote(wsl)} -ArgumentList ${list} -Verb RunAs -Wait -PassThru; exit $p.ExitCode } catch { Write-Output $_.Exception.Message; exit ${ERROR_CANCELLED} }`;
    const result = await run(powershell, [...psArgs, script]);
    return { ...result, cancelled: result.code === ERROR_CANCELLED };
  };

  return {
    async windowsBuild() {
      if (process.platform !== "win32") return null;
      const build = Number(release().split(".")[2]);
      return Number.isFinite(build) ? build : null;
    },
    async bootedAt() {
      const result = await run(powershell, [
        ...psArgs,
        "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')",
      ]);
      return result.code === 0 ? result.output.trim() : "";
    },
    async policy(): Promise<WslPolicy> {
      const result = await run(reg, ["query", POLICY_KEY, "/v", "AllowWSL"]);
      return { allowWsl: result.code === 0 ? parseRegDword(result.output) : undefined };
    },
    status: () => run(wsl, ["--status"]),
    async distros() {
      const result = await run(wsl, ["--list", "--verbose"]);
      return result.code === 0 ? parseDistroList(result.output) : [];
    },
    installWsl: () => elevated("--install", "--no-distribution", "--web-download"),
    updateWsl: () => elevated("--update"),
    importDistro: (name, location, rootfs) =>
      run(wsl, ["--import", name, location, rootfs, "--version", "2"]),
    runInDistro: (name, program) => run(wsl, ["-d", name, "--exec", ...program]),
    async setRunOnce(command) {
      await run(reg, [
        "add",
        RUN_ONCE_KEY,
        "/v",
        RUN_ONCE_NAME,
        "/t",
        "REG_SZ",
        "/d",
        command,
        "/f",
      ]);
    },
    async clearRunOnce() {
      await run(reg, ["delete", RUN_ONCE_KEY, "/v", RUN_ONCE_NAME, "/f"]);
    },
  };
}

/**
 * The real host for "Remove sandbox setup". It only runs `wsl --export` and
 * `wsl --unregister` with the arguments it is given; `removeWslSetup` is the
 * guard that decides whether they may run. `run` and `sizeOf` are only for
 * tests of this file.
 */
export function systemWslRemoveHost(
  run: Run = systemRun,
  sizeOf: (file: string) => Promise<number | null> = fileSize,
): WslRemoveHost {
  const root = process.env["SystemRoot"] ?? process.env["windir"] ?? "%SystemRoot%";
  const wsl = join(root, "System32", "wsl.exe");
  return {
    async distros() {
      const result = await run(wsl, ["--list", "--verbose"]);
      return result.code === 0 ? parseDistroList(result.output) : [];
    },
    exportDistro: (name, file) => run(wsl, ["--export", name, file]),
    unregisterDistro: (name) => run(wsl, ["--unregister", name]),
    exportedSize: sizeOf,
  };
}

async function fileSize(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size;
  } catch {
    return null;
  }
}
