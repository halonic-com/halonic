// The `--wsl-setup` one-shot (HAL-16770): Studio's shell runs the Windows
// host with it to set up Halonic's WSL distro, since the host in the distro
// can't start before the distro exists (HAL-16765).
import { win32 } from "node:path";
import {
  HALONIC_DISTRO,
  systemWslHost,
  type WslHost,
  WslSetup,
  type WslSetupResult,
} from "@halonicjs/adapter-sandbox-srt";
import type { HostIo } from "../host.ts";
import { fileWslSetupStore } from "./wsl-remove-host.ts";

/**
 * Why `--wsl-setup` didn't start the setup.
 *
 * - `in-distro`: the host runs in Halonic's distro (`--wsl-shared-folders`), which has no `wsl.exe`.
 * - `not-windows`: WSL is a Windows feature.
 * - `bad-flags`: a flag the shell passes is missing or isn't valid; a bug in the caller.
 */
export type WslSetupRefusal = "in-distro" | "not-windows" | "bad-flags";

/**
 * What `--wsl-setup` prints, as one JSON line: how the setup ended, or why it
 * didn't start (`refused`), or that the setup threw (`error`): its saved state
 * couldn't be read or saved, a program such as `wsl.exe` couldn't be started,
 * or `RunOnce` couldn't be set. `detail` is for logs and support, never words
 * for the person.
 */
export type WslSetupCommandResult =
  | WslSetupResult
  | { outcome: "refused"; code: WslSetupRefusal; detail: string }
  | { outcome: "error"; detail: string };

/** The Windows machine as `--wsl-setup` sees it; tests hand a fake one. */
export interface WslSetupMachine {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  host(): WslHost;
}

/** This machine: its platform, its environment and the real `wsl.exe`. */
export function systemWslSetupMachine(): WslSetupMachine {
  return { platform: process.platform, env: process.env, host: () => systemWslHost() };
}

/**
 * Runs the WSL setup from the Windows side and prints the result as one JSON
 * line. Every value it uses comes from flags the shell fixes (`--wsl-image`,
 * `--wsl-resume`) or from the host's own profile and `LOCALAPPDATA`. The
 * runtime step is left to the shell, which installs the runtime when it next
 * starts the host in the distro.
 *
 * @returns 0 when the setup is `done`, 1 otherwise
 */
export async function wslSetupCommand(
  args: readonly string[],
  profileFolder: string | undefined,
  io: Pick<HostIo, "write">,
  machine: WslSetupMachine = systemWslSetupMachine(),
): Promise<number> {
  const result = await setUpWsl(args, profileFolder, machine);
  io.write(`${JSON.stringify(result)}\n`);
  return result.outcome === "done" ? 0 : 1;
}

async function setUpWsl(
  args: readonly string[],
  profileFolder: string | undefined,
  machine: WslSetupMachine,
): Promise<WslSetupCommandResult> {
  if (args.includes("--wsl-shared-folders")) {
    return refused("in-distro", "--wsl-setup runs on Windows, not in Halonic's distro");
  }
  if (machine.platform !== "win32") {
    return refused("not-windows", `--wsl-setup needs Windows, not ${machine.platform}`);
  }
  const flags = setupFlags(args, profileFolder, machine.env);
  if ("problem" in flags) return refused("bad-flags", flags.problem);
  const setup = new WslSetup({
    host: machine.host(),
    store: fileWslSetupStore(flags.profileFolder),
    location: flags.location,
    rootfs: flags.image,
    resumeCommand: flags.resume,
    runtime: "left-to-shell",
  });
  try {
    return await setup.run();
  } catch (error) {
    return { outcome: "error", detail: describeError(error) };
  }
}

interface SetupFlags {
  profileFolder: string;
  image: string;
  resume: string;
  /** Where the distro's disk goes: `%LOCALAPPDATA%\Halonic\wsl\halonic`. */
  location: string;
}

function setupFlags(
  args: readonly string[],
  profileFolder: string | undefined,
  env: NodeJS.ProcessEnv,
): SetupFlags | { problem: string } {
  if (!isFlagValue(profileFolder) || !isAbsoluteFolder(profileFolder)) {
    return { problem: "--profile-folder must be an absolute path" };
  }
  const image = flagValue(args, "--wsl-image");
  if (image === undefined || !isDrivePath(image)) {
    return { problem: "--wsl-image must be an absolute path on a drive" };
  }
  const resume = flagValue(args, "--wsl-resume");
  if (resume === undefined || !startsWithQuotedProgram(resume)) {
    return { problem: "--wsl-resume must start with a quoted absolute path on a drive" };
  }
  const localAppData = env["LOCALAPPDATA"];
  if (localAppData === undefined || !isDrivePath(localAppData)) {
    return { problem: "LOCALAPPDATA isn't an absolute path on a drive" };
  }
  const location = win32.join(localAppData, "Halonic", "wsl", HALONIC_DISTRO);
  return { profileFolder, image, resume, location };
}

/** The value after `name`, unless it is missing or another flag. */
function flagValue(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  const value = at === -1 ? undefined : args[at + 1];
  return isFlagValue(value) ? value : undefined;
}

function isFlagValue(value: string | undefined): value is string {
  return value !== undefined && value !== "" && !value.startsWith("--");
}

/**
 * A drive letter, a colon and a slash, with no `..` part: these paths go to
 * `wsl --import`, so a relative one would depend on the folder the shell
 * started the host in.
 */
function isDrivePath(path: string): boolean {
  if (!/^[A-Za-z]:[\\/]/.test(path)) return false;
  return !path.split(/[\\/]/).includes("..");
}

/**
 * Absolute without a `..` part. A rooted path such as `\\server\share` or one
 * starting with a slash passes too: the state file is only read by this host,
 * and the tests keep it in a real temporary folder.
 */
function isAbsoluteFolder(path: string): boolean {
  return win32.isAbsolute(path) && !path.split(/[\\/]/).includes("..");
}

/**
 * `RunOnce` runs the command line through Windows after a restart, so the
 * program it names is a quoted drive path: never a bare name found on `PATH`,
 * and never cut at a space.
 */
function startsWithQuotedProgram(commandLine: string): boolean {
  const program = /^"([^"]+)"/.exec(commandLine)?.[1];
  return program !== undefined && isDrivePath(program);
}

function refused(code: WslSetupRefusal, detail: string): WslSetupCommandResult {
  return { outcome: "refused", code, detail };
}

/** The error and its cause, as the store's errors wrap what the file system said. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause === undefined ? error.message : `${error.message} ${String(error.cause)}`;
}
