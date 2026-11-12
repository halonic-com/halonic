import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The signed program that does the Windows sandbox's administrator work
 * (`apps/studio/src-tauri/crates/sandbox-elevate`, HAL-1451). It ships next
 * to Halonic's own programs, so the agent host finds it next to itself.
 */
export const HELPER = "halonic-sandbox-elevate.exe";

/** What the helper is asked to do; it takes nothing else. */
export type HelperVerb = "setup" | "remove";

/** Windows' code for "the user said no to the administrator prompt", from the helper or from starting it. */
export const HELPER_CANCELLED = 10;

/** Starting the helper itself failed: Windows didn't run it. The helper's own codes stop at 36. */
export const HELPER_DIDNT_START = 37;

/**
 * Where the helper is for a program at `execPath`: next to it, as for the
 * agent host in Halonic's app folder. Null when it isn't there, as for the
 * CLI run by Node.
 */
export function findHelper(
  execPath: string = process.execPath,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const helper = join(dirname(execPath), HELPER);
  return exists(helper) ? helper : null;
}

/**
 * The PowerShell that starts the helper with one administrator prompt and
 * exits with its exit code: 10 when the prompt is turned down, 37 with the
 * reason on stderr when Windows can't start it.
 */
export function helperScript(helper: string, verb: HelperVerb): string {
  const quoted = `'${helper.replaceAll("'", "''")}'`;
  return [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    `  $p = Start-Process -FilePath ${quoted} -ArgumentList '${verb}' -Verb RunAs -WindowStyle Hidden -PassThru`,
    // Without reading the handle first, ExitCode can be empty once it exits.
    "  $null = $p.Handle",
    "  $p.WaitForExit()",
    "  exit $p.ExitCode",
    "} catch {",
    "  $e = $_.Exception",
    `  if ($e.NativeErrorCode -eq 1223 -or $e.InnerException.NativeErrorCode -eq 1223) { exit ${HELPER_CANCELLED} }`,
    "  [Console]::Error.WriteLine($e.Message)",
    `  exit ${HELPER_DIDNT_START}`,
    "}",
  ].join("\n");
}

/** Runs a program and gives its exit code and stderr. `machine.ts` gives the real one. */
export type Spawn = (file: string, args: string[]) => Promise<{ code: number; stderr: string }>;

/**
 * Starts the helper with `verb` and waits for it, without a time limit: an
 * administrator prompt approved late still runs the setup, so stopping early
 * would only hide its result (HAL-1415, 2 point 5).
 *
 * @returns the helper's exit code, and the reason when Windows couldn't start it
 */
export async function runHelper(
  helper: string,
  verb: HelperVerb,
  spawn: Spawn,
): Promise<{ code: number; stderr: string }> {
  const root = process.env["SystemRoot"] ?? process.env["windir"];
  if (root === undefined)
    return { code: HELPER_DIDNT_START, stderr: "Windows' folder isn't known" };
  const powershell = join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];
  return spawn(powershell, [...args, helperScript(helper, verb)]);
}

/** The sentence for each of the helper's codes other than 0 and 10, to follow "The sandbox isn't set up: " or "The sandbox wasn't removed: ". */
const reasons: Readonly<Record<number, string>> = {
  12: "Windows didn't accept the sandbox's network rules",
  13: "the sandbox is already set up on this computer with other settings, perhaps by another program",
  14: "Windows couldn't create the sandbox's account",
  17: "Windows couldn't keep the sandbox out of its shared system folders",
  30: "Halonic started its sandbox helper the wrong way",
  31: "the sandbox helper didn't get administrator rights",
  32: "Halonic's copy of the sandbox program is missing. Reinstall Halonic",
  33: "Halonic's copy of the sandbox program has been changed, so it wasn't run. Reinstall Halonic",
  34: "Windows couldn't prepare the sandbox's folder in Program Files",
  35: "Windows couldn't add the sandbox to Installed apps",
  36: "the sandbox program couldn't start",
};

/** The helper didn't do it: the reason sentence, and the helper's code to show after it in small text. */
export class HelperError extends Error {
  readonly code: number;
  constructor(reason: string, code: number) {
    super(reason);
    this.name = "HelperError";
    this.code = code;
  }
}

/**
 * Why the helper failed, as a sentence. A reason is never a bare code (UX
 * checklist on HAL-1444, 1.0); {@link HelperError} carries the code.
 */
export function helperFailure(verb: HelperVerb, code: number, stderr: string): string {
  if (code === HELPER_DIDNT_START) {
    const why = stderr.trim().split(/\r?\n/)[0];
    return `Windows couldn't start the sandbox helper${why ? `: ${why}` : ""}`;
  }
  return (
    reasons[code] ?? `the sandbox ${verb === "setup" ? "setup" : "removal"} stopped with an error`
  );
}

/**
 * Runs `verb` through the helper at `helper`.
 *
 * @returns `done`, or `cancelled` when the administrator prompt was turned down; nothing changed then
 * @throws {HelperError} when the helper ran and failed, or couldn't start
 */
export async function throughHelper(
  helper: string,
  verb: HelperVerb,
  spawn: Spawn,
): Promise<"done" | "cancelled"> {
  const { code, stderr } = await runHelper(helper, verb, spawn);
  if (code === 0) return "done";
  if (code === HELPER_CANCELLED) return "cancelled";
  throw new HelperError(helperFailure(verb, code, stderr), code);
}
