// Where the CLI runs under WSL, for the warnings `halonic doctor` gives
// there (HAL-6517, from the WSL2 first-run research on HAL-6504).

import { readFileSync } from "node:fs";

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
