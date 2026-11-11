// Where each connector's program is on this computer. The trust check
// fingerprints that path with the command, so a program that changes place
// changes the fingerprint. Every command that checks trust (`doctor`,
// `trust`, `run`) finds the paths here, so they all compute one fingerprint.

import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import type { Connector } from "@halonicjs/format";

/** What {@link commandPaths} reads from the system. */
export interface CommandSearch {
  /** The `PATH` variable, split on the system's delimiter. */
  readonly path: string | undefined;
  /** The endings Windows tries, from `PATHEXT`; empty elsewhere. */
  readonly endings: readonly string[];
}

/** Windows' own list, for when `PATHEXT` isn't set. */
const defaultWindowsEndings = [".com", ".exe", ".bat", ".cmd"];

/** This process's `PATH`, with `PATHEXT`'s endings on Windows. */
export function nodeCommandSearch(): CommandSearch {
  const endings =
    process.platform === "win32"
      ? (process.env["PATHEXT"]?.split(";").filter((ending) => ending !== "") ??
        defaultWindowsEndings)
      : [];
  return { path: process.env["PATH"], endings };
}

/**
 * The absolute path of each stdio connector's command, by the command as
 * written, as the trust check takes it (`commandPaths`).
 *
 * The command is looked for in each absolute folder of `PATH`, in order,
 * as the system would start it. A command that holds a folder, such as
 * `./bin/mail`, is kept as written only, and so is one that isn't found:
 * the trust check then fingerprints the command alone.
 *
 * @example
 * await commandPaths([mailConnector], nodeCommandSearch());
 * // Map { "npx" => "/usr/bin/npx" }
 */
export async function commandPaths(
  connectors: readonly Connector[],
  search: CommandSearch,
): Promise<Map<string, string>> {
  const commands = new Set(
    connectors.flatMap((connector) =>
      "stdio" in connector.transport ? [connector.transport.stdio.command] : [],
    ),
  );
  const paths = new Map<string, string>();
  for (const command of commands) {
    const path = await findCommand(command, search);
    if (path !== null) paths.set(command, path);
  }
  return paths;
}

/**
 * Where the system would start `command` from: the first program of that
 * name in an absolute folder of `PATH`, or `null` when there's none or the
 * command holds a folder.
 */
export async function findCommand(command: string, search: CommandSearch): Promise<string | null> {
  if (command === "" || /[\\/]/.test(command)) return null;
  const names = candidateNames(command, search.endings);
  for (const folder of (search.path ?? "").split(delimiter)) {
    // An empty or relative entry would mean the current folder; skip it.
    if (!isAbsolute(folder)) continue;
    for (const name of names) {
      const candidate = join(folder, name);
      if (await isProgram(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * The file names `command` can start: itself where there are no endings;
 * on Windows, itself with each ending, or only itself when it already has
 * one, because Windows never starts `npx` without its `.cmd`.
 */
function candidateNames(command: string, endings: readonly string[]): string[] {
  if (endings.length === 0) return [command];
  const lower = command.toLowerCase();
  if (endings.some((ending) => lower.endsWith(ending.toLowerCase()))) return [command];
  return endings.map((ending) => `${command}${ending.toLowerCase()}`);
}

async function isProgram(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
