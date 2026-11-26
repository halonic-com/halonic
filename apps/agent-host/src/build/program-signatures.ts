import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isPortableExecutable, signatureState } from "./pe-signature.ts";

/**
 * Asks Authenticode about a signed program and answers its status, such as
 * `Valid` or `HashMismatch`; `undefined` where Authenticode isn't available
 * (off Windows).
 */
export type AuthenticodeStatus = (path: string) => string | undefined;

/** One program's result: its path inside the folder, and what was found. */
export interface ProgramSignature {
  readonly path: string;
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * Checks one program: an empty security directory (unsigned) passes, as does
 * a signature Authenticode calls `Valid`. Anything else fails: a security
 * directory that holds no certificate, as when a program is changed after
 * signing, or one Authenticode doesn't accept. Off Windows only the shape of
 * the signature is checked, and the result says so.
 */
export function checkProgram(
  path: string,
  bytes: Uint8Array,
  authenticode: AuthenticodeStatus,
): ProgramSignature {
  const state = signatureState(bytes);
  if (state.kind === "none") return { path, ok: true, detail: "not signed" };
  const where = `${state.directory.size} bytes at ${state.directory.offset}`;
  if (state.kind === "broken") {
    return { path, ok: false, detail: `broken security directory (${where}): ${state.reason}` };
  }
  const status = authenticode(path);
  if (status === undefined) {
    return { path, ok: true, detail: `signed (${where}); Authenticode not checked off Windows` };
  }
  return { path, ok: status === "Valid", detail: `signed (${where}), Authenticode says ${status}` };
}

/** Every Windows program or DLL in a folder and its subfolders, checked as `checkProgram` does. */
export function checkPrograms(
  folder: string,
  authenticode: AuthenticodeStatus,
): ProgramSignature[] {
  const files = readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  const results: ProgramSignature[] = [];
  for (const file of files) {
    const bytes = readFileSync(file);
    if (!isPortableExecutable(bytes)) continue;
    results.push(checkProgram(file, bytes, authenticode));
  }
  return results;
}
