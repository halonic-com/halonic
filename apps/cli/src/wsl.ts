// Where the CLI runs under WSL, for the warnings `halonic doctor` gives
// there (HAL-6517, from the WSL2 first-run research on HAL-6504).

import { readFileSync } from "node:fs";
import type { NodeProblem } from "@halonicjs/app";

/**
 * Whether `/proc/version` says Linux runs under WSL: Microsoft's kernel
 * names itself there, as "…-microsoft-standard-WSL2".
 *
 * @example
 * isWslKernel("Linux version 6.6.87.2-microsoft-standard-WSL2 …"); // true
 */
export function isWslKernel(procVersion: string): boolean {
  return /microsoft/i.test(procVersion);
}

/** Whether this process runs on Linux under WSL. */
export function nodeIsWsl(): boolean {
  if (process.platform !== "linux") return false;
  try {
    return isWslKernel(readFileSync("/proc/version", "utf8"));
  } catch {
    return false; // No /proc/version: not a kernel WSL starts.
  }
}

/**
 * The Windows drive `path` is on under WSL, such as "/mnt/c", or `null`
 * when it is in Linux's own files. WSL mounts each drive at `/mnt/<letter>`.
 *
 * @example
 * windowsDriveOf("/mnt/c"); // "/mnt/c", and the same for every folder on it
 * windowsDriveOf("/srv/acme"); // null
 */
export function windowsDriveOf(path: string): string | null {
  return /^\/mnt\/[a-z](?=\/|$)/i.exec(path)?.[0] ?? null;
}

/**
 * Whether `folder` is a WSL folder as Windows reaches it, on the WSL share
 * `wsl$` or `wsl.localhost`.
 *
 * @example
 * isWslShare("//wsl.localhost/Ubuntu/srv/acme"); // true, also with backslashes
 * isWslShare("\\\\server\\share\\acme"); // false
 */
export function isWslShare(folder: string): boolean {
  return /^[\\/]{2}wsl(\$|\.localhost)[\\/]/i.test(folder);
}

/** What {@link nodeProblemOf} asks of the process and its computer. */
export interface NodePlace {
  /** The system Node.js was built for, `process.platform`. */
  readonly platform: NodeJS.Platform;
  /** The working folder. */
  readonly cwd: string;
  /** Whether Linux runs under WSL; only asked on Linux. */
  readonly wsl: () => boolean;
  /** Where `PATH` finds `pnpm`, or `null`; only asked inside WSL. */
  readonly findPnpm: () => Promise<string | null>;
}

/**
 * What is wrong with the Node.js that runs Halonic, for `halonic doctor`'s
 * Node.js line, or `null`:
 *
 * - Windows' Node.js reports `win32` even in a WSL folder, so a working
 *   folder on the WSL share `wsl$` or `wsl.localhost` gives it away.
 * - Inside WSL, Windows' `PATH` is added to Linux's, so the `pnpm` found
 *   first can be Windows' one, under `/mnt/`.
 */
export async function nodeProblemOf(place: NodePlace): Promise<NodeProblem | null> {
  if (place.platform === "win32") {
    return isWslShare(place.cwd) ? { problem: "windows-node-in-wsl" } : null;
  }
  if (place.platform !== "linux" || !place.wsl()) return null;
  const pnpm = await place.findPnpm();
  return pnpm?.startsWith("/mnt/") === true ? { problem: "windows-pnpm", pnpm } : null;
}
