// Where each connector's program is on this computer. The trust check
// fingerprints that path with the command, so a program that changes place
// changes the fingerprint. Every command that checks trust (`doctor`,
// `trust`, `run`) finds the paths here, so they all compute one fingerprint.

import { stat } from "node:fs/promises";
import { delimiter, isAbsolute, sep } from "node:path";
import { commandPaths as sharedCommandPaths } from "@halonicjs/app";
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
 * written, found in `PATH` as the system would start it (see
 * {@link findCommand}).
 *
 * @example
 * await commandPaths([mailConnector], nodeCommandSearch());
 * // Map { "npx" => "/usr/bin/npx" }
 */
export async function commandPaths(
  connectors: readonly Connector[],
  search: CommandSearch,
): Promise<Map<string, string>> {
  return await sharedCommandPaths(connectors, (command) => findCommand(command, search));
}

/**
 * Where the system would start `command` from: the first program of that
 * name in an absolute folder of `PATH`, or `null` when there's none or the
 * command holds a folder.
 */
export async function findCommand(command: string, search: CommandSearch): Promise<string | null> {
  if (command === "" || /[\\/]/.test(command)) return null;
  const names = candidateNames(command, search.endings);
  for (const folder of splitPath(search.path ?? "")) {
    // An empty or relative entry would mean the current folder; skip it.
    if (!isAbsoluteFolder(folder)) continue;
    for (const name of names) {
      const candidate = joinPlain(folder, name);
      if (await isProgram(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * The entries of `PATH`. Where the delimiter is `;` (Windows), double quotes
 * group an entry and are dropped, as the shell's `split_paths` does.
 */
function splitPath(path: string): string[] {
  if (delimiter !== ";") return path.split(delimiter);
  const entries: string[] = [];
  let entry = "";
  let quoted = false;
  for (const char of path) {
    if (char === '"') quoted = !quoted;
    else if (char === ";" && !quoted) {
      entries.push(entry);
      entry = "";
    } else entry += char;
  }
  entries.push(entry);
  return entries;
}

/** Absolute as the shell sees it: on Windows a drive or UNC prefix, not just `\tools`. */
function isAbsoluteFolder(folder: string): boolean {
  if (!isAbsolute(folder)) return false;
  return delimiter !== ";" || /^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(folder);
}

/**
 * `folder` and `name` with a separator between, and the folder as written:
 * no `//`, `./` or `..` is tidied away, because the shell keeps them too and
 * the trust check fingerprints the string.
 */
function joinPlain(folder: string, name: string): string {
  const last = folder.slice(-1);
  const ends = last === "/" || (sep === "\\" && last === "\\");
  return ends ? `${folder}${name}` : `${folder}${sep}${name}`;
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
    const info = await stat(path);
    if (!info.isFile()) return false;
    // Any execute bit, as the shell checks, not only the current user's.
    return process.platform === "win32" || (info.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}
