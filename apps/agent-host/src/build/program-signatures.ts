import { closeSync, openSync, readdirSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";
import { isPortableExecutable, signatureState } from "./pe-signature.ts";

/** One program's result: its path, whether it passes, and what was found. */
export interface ProgramSignature {
  readonly path: string;
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * Checks one program's security directory: empty (unsigned) passes, and so
 * does one that holds a certificate. One that holds anything else fails, as
 * when a program is changed after signing. Whether a certificate is a valid
 * signature is Authenticode's call, which the Windows installer build asks
 * for every program (build-installer.ps1), since Authenticode alone calls such
 * a broken directory merely "not signed".
 */
export function checkProgram(path: string, bytes: Uint8Array): ProgramSignature {
  const state = signatureState(bytes);
  if (state.kind === "none") return { path, ok: true, detail: "not signed" };
  const where = `${state.directory.size} bytes at ${state.directory.offset}`;
  if (state.kind === "broken") {
    return { path, ok: false, detail: `broken security directory (${where}): ${state.reason}` };
  }
  return { path, ok: true, detail: `signed (${where})` };
}

/** Whether a file starts with "MZ", read from its first two bytes only. */
function startsWithMz(file: string): boolean {
  const head = new Uint8Array(2);
  const fd = openSync(file, "r");
  try {
    return readSync(fd, head, 0, 2, 0) === 2 && head[0] === 0x4d && head[1] === 0x5a;
  } finally {
    closeSync(fd);
  }
}

/**
 * Every Windows program or DLL in a folder and its subfolders, checked as
 * `checkProgram` does. Only files that start with "MZ" are read in full, so
 * large archives such as the WSL image cost two bytes each.
 */
export function checkPrograms(folder: string): ProgramSignature[] {
  const files = readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  const results: ProgramSignature[] = [];
  for (const file of files) {
    if (!startsWithMz(file)) continue;
    const bytes = readFileSync(file);
    if (!isPortableExecutable(bytes)) continue;
    results.push(checkProgram(file, bytes));
  }
  return results;
}
