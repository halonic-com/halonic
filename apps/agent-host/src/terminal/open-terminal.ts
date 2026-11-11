import { spawn } from "node:child_process";
import { chmod, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve, win32 } from "node:path";
import { findProgram, isAbsolutePath } from "@halonicjs/adapter-system-node";
import { skillScriptsRefusal, touchesSkillScripts } from "@halonicjs/format";

/**
 * A program to run in a terminal window the person can see, such as
 * `claude auth login` for one agent.
 */
export interface TerminalCommand {
  /** The program's absolute path, as `findProgram` found it. */
  readonly program: string;
  /** Its arguments: plain words such as `auth` or `login`, nothing a shell would read. */
  readonly args: readonly string[];
  /** Variables it gets on top of the person's own environment, such as `CLAUDE_CONFIG_DIR`. */
  readonly variables: Readonly<Record<string, string>>;
}

/** Whether a terminal window opened, or why none did, in a sentence for the log. */
export type TerminalOpened = { opened: true } | { opened: false; reason: string };

/** Starts a program that outlives the call, without waiting for it; rejects when it can't start. */
export type StartDetached = (start: DetachedStart) => Promise<void>;

/** What {@link StartDetached} starts. */
export interface DetachedStart {
  readonly program: string;
  readonly args: readonly string[];
  /** The folder it starts in: the person's home folder, never the host's own. */
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Windows only: pass `args` to the program exactly as written, for `cmd.exe`. */
  readonly verbatim?: boolean;
}

/** What {@link openTerminal} reads from this computer; tests pass their own. */
export interface OpenTerminalOptions {
  platform?: NodeJS.Platform;
  /** The person's environment, which the program gets too; `process.env` by default. */
  env?: Readonly<Record<string, string | undefined>>;
  /** The folder the terminal starts in; the person's home folder by default. */
  home?: string;
  /** Where the macOS launch file goes; the system's temp folder by default. */
  tempFolder?: string;
  start?: StartDetached;
}

/**
 * The terminals tried on Linux, in order, each with the flag that runs a
 * program with its arguments after it. `x-terminal-emulator` is the
 * system's chosen one on Debian and Ubuntu.
 */
const linuxTerminals: readonly { name: string; runFlag: string }[] = [
  { name: "x-terminal-emulator", runFlag: "-e" },
  { name: "gnome-terminal", runFlag: "--" },
  { name: "konsole", runFlag: "-e" },
  { name: "xfce4-terminal", runFlag: "-x" },
  { name: "xterm", runFlag: "-e" },
];

/** A plain word: what an argument may be, so no shell reads anything into it. */
const plainWord = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

/** An environment variable's name. */
const variableName = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/**
 * Opens a new terminal window that runs `command`, so the person sees what
 * the program asks and answers it themselves, as for an agent's sign-in
 * (HAL-5395). It returns once the window is on its way and doesn't wait for
 * the program to end.
 *
 * - **Windows:** `cmd.exe` from the system folder runs `start`, which opens
 *   a new console window for the program. The variables travel in the
 *   environment, never on the command line.
 * - **macOS:** a `.command` file in a private temp folder, opened with
 *   `open`, so the person's chosen terminal (Terminal by default) runs it.
 *   The variables are written into it, quoted for `sh`.
 * - **Linux:** the first terminal of {@link linuxTerminals} on the `PATH`,
 *   with the variables in its environment. Without a desktop session
 *   (`DISPLAY` or `WAYLAND_DISPLAY`) none can open.
 *
 * @throws Error when an argument isn't a plain word, a variable's name isn't
 * one, or the program isn't an absolute path: that is a mistake in the
 * caller, not on this computer. Also when the program or a variable points
 * under a skill's `scripts/` folder, which Halonic never runs.
 *
 * @example
 * const opened = await openTerminal({
 *   program: "/usr/local/bin/claude",
 *   args: ["auth", "login"],
 *   variables: { CLAUDE_CONFIG_DIR: settingsFolder },
 * });
 * if (!opened.opened) showCommandToRunByHand();
 */
export async function openTerminal(
  command: TerminalCommand,
  options: OpenTerminalOptions = {},
): Promise<TerminalOpened> {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  checkCommand(command, platform);
  const named = { cwd: home, program: command.program, args: command.args, env: command.variables };
  if (await touchesSkillScripts(named, { resolve, realpath })) throw new Error(skillScriptsRefusal);

  const env = { ...(options.env ?? process.env), ...command.variables };
  const start = options.start ?? startDetached;
  const where: Where = { home, env, start };
  try {
    if (platform === "win32") return await openOnWindows(command, where);
    if (platform === "darwin")
      return await openOnMac(command, options.tempFolder ?? tmpdir(), where);
    return await openOnLinux(command, where);
  } catch {
    return { opened: false, reason: "The terminal couldn't be started." };
  }
}

/** Where the terminal starts, with what, and how. */
interface Where {
  readonly home: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly start: StartDetached;
}

function checkCommand(command: TerminalCommand, platform: NodeJS.Platform): void {
  if (!isAbsolutePath(command.program, platform)) {
    throw new Error("The program to run in a terminal must be an absolute path.");
  }
  for (const arg of command.args) {
    if (!plainWord.test(arg)) throw new Error(`"${arg}" isn't a plain word.`);
  }
  for (const name of Object.keys(command.variables)) {
    if (!variableName.test(name)) throw new Error(`"${name}" isn't a variable name.`);
  }
}

/**
 * `cmd.exe /d /v:off /s /c "start "Halonic" "<program>" <args>"`. Inside
 * double quotes `cmd` reads `&`, `|`, `(` and `^` as they are, but still
 * expands `%`, so a program path with `%` in it isn't run. `/d` skips the
 * person's AutoRun commands and `/v:off` the `!` expansion.
 */
async function openOnWindows(
  command: TerminalCommand,
  { home, env, start }: Where,
): Promise<TerminalOpened> {
  const systemRoot = env["SystemRoot"] ?? env["SYSTEMROOT"];
  if (systemRoot === undefined || !isAbsolutePath(systemRoot, "win32")) {
    return { opened: false, reason: "The Windows folder isn't known, so cmd.exe can't be found." };
  }
  if (command.program.includes("%")) {
    return {
      opened: false,
      reason: "The program's path has a % in it, which cmd.exe would expand.",
    };
  }
  const line = ["start", '"Halonic"', `"${command.program}"`, ...command.args].join(" ");
  await start({
    program: win32.join(systemRoot, "System32", "cmd.exe"),
    args: ["/d", "/v:off", "/s", "/c", `"${line}"`],
    cwd: home,
    env,
    verbatim: true,
  });
  return { opened: true };
}

/**
 * Writes `sign-in.command` (owner only) into a new private temp folder and
 * opens it. The file stays: the terminal reads it after `open` returns, and
 * it holds no secret, only the program's path and the variables.
 */
async function openOnMac(
  command: TerminalCommand,
  tempFolder: string,
  { home, env, start }: Where,
): Promise<TerminalOpened> {
  const folder = await mkdtemp(join(tempFolder, "halonic-terminal-"));
  const file = join(folder, "sign-in.command");
  await writeFile(file, macLaunchFile(command), { mode: 0o700 });
  await chmod(file, 0o700);
  await start({ program: "/usr/bin/open", args: [file], cwd: home, env });
  return { opened: true };
}

/** The `.command` file's text: `env` sets the variables, so it works whatever the person's shell. */
export function macLaunchFile(command: TerminalCommand): string {
  const assignments = Object.entries(command.variables).map(([name, value]) => `${name}=${value}`);
  const words = ["/usr/bin/env", ...assignments, command.program, ...command.args];
  return `#!/bin/sh\nexec ${words.map(quoteForSh).join(" ")}\n`;
}

/** `text` in single quotes for `sh`, each `'` in it written as `'\''`. */
export function quoteForSh(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

async function openOnLinux(
  command: TerminalCommand,
  { home, env, start }: Where,
): Promise<TerminalOpened> {
  if (env["DISPLAY"] === undefined && env["WAYLAND_DISPLAY"] === undefined) {
    return { opened: false, reason: "There is no desktop session to open a terminal in." };
  }
  for (const terminal of linuxTerminals) {
    const path = await findProgram(terminal.name, { path: env["PATH"] ?? "", platform: "linux" });
    if (path === undefined) continue;
    const args = [terminal.runFlag, command.program, ...command.args];
    await start({ program: path, args, cwd: home, env });
    return { opened: true };
  }
  return { opened: false, reason: "No terminal was found on this computer." };
}

/**
 * Node's `spawn`, detached and with no pipes, so the window outlives the
 * host. It resolves once the program has started and rejects when it can't.
 * On Windows `windowsHide` hides only `cmd.exe`'s own window; `start` opens
 * the program's window as usual.
 */
const startDetached: StartDetached = ({ program, args, cwd, env, verbatim }) =>
  new Promise((started, failed) => {
    const child = spawn(program, [...args], {
      cwd,
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: verbatim === true,
    });
    child.once("error", failed);
    child.once("spawn", () => {
      child.unref();
      started();
    });
  });
