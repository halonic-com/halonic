import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { type RunProgram, runFixed } from "./journal-acl.ts";

/**
 * The folders above `folders` that lie inside the user profile `home`, each
 * once, the outer ones first. srt grants the sandbox account the session's
 * folders, but not their parents; outside the profile Windows lets every user
 * read a folder's attributes, inside it srt's install (without the profile
 * grant) does not. Node checks each parent of a script's path before it runs
 * it (`lstat` while it resolves the path), so it fails there (HAL-5885).
 */
export function parentsInProfile(folders: readonly string[], home: string): string[] {
  const root = win32.resolve(home).toLowerCase();
  const parents = new Map<string, string>();
  for (const folder of folders) {
    const chain: string[] = [];
    let parent = win32.dirname(win32.resolve(folder));
    while (parent.toLowerCase().startsWith(`${root}\\`)) {
      chain.unshift(parent);
      parent = win32.dirname(parent);
    }
    for (const found of chain) {
      if (!parents.has(found.toLowerCase())) parents.set(found.toLowerCase(), found);
    }
  }
  return [...parents.values()];
}

/** The SDDL rights that include reading a file's attributes (`FILE_READ_ATTRIBUTES` is `LO` on its own). */
const readsAttributes = new Set(["FA", "FR", "GA", "GR", "LO"]);

/**
 * Whether `sddl` has an entry that lets `sid` read the attributes of the
 * folder itself: an allow entry that is not inherit-only.
 */
export function letsReadAttributes(sddl: string, sid: string): boolean {
  for (const [, flags = "", mask = "", trustee] of sddl.matchAll(
    /\(A;([^;]*);([^;]*);;;([^)]*)\)/g,
  )) {
    if (trustee !== sid || flags.includes("IO")) continue;
    if (/^0x[0-9a-f]+$/i.test(mask)) {
      // FILE_READ_ATTRIBUTES, GENERIC_ALL or GENERIC_READ.
      if ((Number.parseInt(mask, 16) & 0x9000_0080) !== 0) return true;
    } else if ((mask.match(/../g) ?? []).some((right) => readsAttributes.has(right))) {
      return true;
    }
  }
  return false;
}

/** The access list of `folder` alone, as SDDL, read with `icacls /save` (which writes UTF-16). */
async function readSddl(folder: string, start: RunProgram): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), "halonic-acl-"));
  try {
    const saved = join(scratch, "acl.txt");
    await start("icacls.exe", [folder, "/save", saved]);
    return (await readFile(saved, "utf16le")).replace(/^\uFEFF/, "");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * Lets the sandbox account `sid` read the attributes of each folder in
 * `parents`: `(RA)` on the folder alone, not on what it holds, so it learns
 * the folder's dates and flags but can't list or open anything in it. The
 * entry stays when the session closes: other sessions use the same parents,
 * srt doesn't count our entries, and it gives nothing away. A folder that has
 * it already is left alone, since writing an access list makes Windows walk
 * all the folder holds.
 *
 * @throws when `icacls` fails, so the session doesn't start with a fence it can't prove
 */
export async function letSandboxReadParents(
  parents: readonly string[],
  sid: string,
  start: RunProgram = runFixed,
): Promise<void> {
  for (const parent of parents) {
    if (letsReadAttributes(await readSddl(parent, start), sid)) continue;
    await start("icacls.exe", [parent, "/grant", `*${sid}:(RA)`]);
  }
}
