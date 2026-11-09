import { execFile } from "node:child_process";
import type { RunProgram } from "./process-table.ts";

/** How long a process-table program may take before it is stopped. */
const timeoutMs = 15_000;

/** The most output read from it: a process table with many thousands of lines fits. */
const maxOutputBytes = 32 * 1024 ** 2;

/**
 * Runs a program with Node's `execFile`: no shell, no window on Windows,
 * stopped after 15 seconds.
 */
export const systemRunProgram: RunProgram = (program, args) =>
  new Promise((resolve, reject) => {
    execFile(
      program,
      [...args],
      { encoding: "utf8", timeout: timeoutMs, maxBuffer: maxOutputBytes, windowsHide: true },
      (error, stdout) => {
        if (error === null) {
          resolve(stdout);
          return;
        }
        reject(new Error(`Couldn't read the process table with ${program}.`, { cause: error }));
      },
    );
  });
