// Ids and keys of the routine scheduler. Core can't call `crypto.subtle`, so
// the short hash is done here; it moves to `@halonicjs/std` if another
// package needs it. The UTF-8 bytes come from std.

import { encodeUtf8 } from "@halonicjs/std";

/** The most UTF-8 bytes in a run id or a `Coordination` key (ports). */
const maxIdBytes = 256;

/**
 * The run id of a routine fire: the same workspace, routine and due time
 * always give the same id, so the executor starts it once however often it
 * is asked, and two workspaces sharing a run store never share a run.
 *
 * Normally `routine:<workspace hash>/<routine key>@<due time>`. A routine key
 * so long that the id would go over 256 UTF-8 bytes is hashed as well.
 *
 * @param workspaceId - names the workspace for as long as it exists, the same on every host (never a path)
 */
export function routineRunId(workspaceId: string, key: string, at: Date): string {
  const workspace = shortHash(workspaceId);
  const due = at.toISOString();
  const readable = `routine:${workspace}/${key}@${due}`;
  if (utf8Length(readable) <= maxIdBytes) {
    return readable;
  }
  return `routine:${workspace}/#${shortHash(key)}@${due}`;
}

/** The `Coordination` key that keeps a workspace's last routine tick. */
export function lastTickKey(workspaceId: string): string {
  return `routines/${shortHash(workspaceId)}/last-tick`;
}

/**
 * The `Coordination` key that keeps when a routine of a workspace last ran,
 * for `{{trigger.lastRun}}`. The routine key is hashed, so the key stays
 * short however long the routine key is.
 */
export function lastRunKey(workspaceId: string, key: string): string {
  return `routines/${shortHash(workspaceId)}/last-run/${shortHash(key)}`;
}

const fnvOffset = 0xcbf29ce484222325n;
const fnvPrime = 0x100000001b3n;
const mask64 = (1n << 64n) - 1n;

/**
 * 16 hex digits of FNV-1a (64-bit) over the UTF-8 bytes of a text: short,
 * stable everywhere, and spread well enough that different workspaces or
 * routine keys don't meet. Not for secrets.
 */
export function shortHash(text: string): string {
  let hash = fnvOffset;
  for (const byte of encodeUtf8(text)) {
    hash = ((hash ^ BigInt(byte)) * fnvPrime) & mask64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** How many bytes a text takes in UTF-8; a lone surrogate counts as U+FFFD, as with `TextEncoder`. */
export function utf8Length(text: string): number {
  return encodeUtf8(text).length;
}
