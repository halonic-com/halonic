// Ids and keys of the routine scheduler. Core can't call `crypto.subtle`, so
// the short hash is done here; it moves to `@halonicjs/std` if another
// package needs it. The UTF-8 bytes come from std.

import { encodeUtf8 } from "@halonicjs/std";

/**
 * The run id of a routine fire: the same workspace, routine and due time
 * always give the same id, so the executor starts it once however often it
 * is asked, and two workspaces sharing a run store never share a run.
 *
 * `routine-<workspace hash>-<due time>-<hash of the routine key and due time>`,
 * such as `routine-9f67cab0a2a7258c-20261103T080000.000Z-5d2b8e…`: 62
 * letters, digits, "-" and "." whatever the key, so every run store keeps it
 * as a file name (`checkRunId` of `@halonicjs/ports`). The routine key is in
 * the run's `trigger.routineId`. The hash comes last, so the short id people
 * type, the last 6 characters, differs from run to run.
 *
 * @param workspaceId - names the workspace for as long as it exists, the same on every host (never a path)
 */
export function routineRunId(workspaceId: string, key: string, at: Date): string {
  const due = at.toISOString();
  const compactDue = due.replaceAll("-", "").replaceAll(":", "");
  return `${routineRunPrefix(workspaceId)}${compactDue}-${shortHash(`${key}@${due}`)}`;
}

/** How the id of every routine run of a workspace starts, so runs of other workspaces can be told apart. */
export function routineRunPrefix(workspaceId: string): string {
  return `routine-${shortHash(workspaceId)}-`;
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
  return lastRunKeyByHash(workspaceId, shortHash(key));
}

/** {@link lastRunKey} from the {@link shortHash} of the routine key, as {@link lastRunIndexKey} keeps it. */
export function lastRunKeyByHash(workspaceId: string, keyHash: string): string {
  return `routines/${shortHash(workspaceId)}/last-run/${keyHash}`;
}

/**
 * The `Coordination` key that lists the hashed routine keys of a workspace
 * whose last run may be stored, so a removed routine's can be deleted:
 * `Coordination` can't list its keys.
 */
export function lastRunIndexKey(workspaceId: string): string {
  return `routines/${shortHash(workspaceId)}/last-run-keys`;
}

/**
 * The `Coordination` key that keeps a workspace's queued due times
 * (`overlap: queue`), for all its routines in one value.
 */
export function queueKey(workspaceId: string): string {
  return `routines/${shortHash(workspaceId)}/queue`;
}

/**
 * The `Coordination` key that keeps the skip records of a routine of a
 * workspace. The routine key is hashed, as for {@link lastRunKey}.
 */
export function skipsKeyByHash(workspaceId: string, keyHash: string): string {
  return `routines/${shortHash(workspaceId)}/skips/${keyHash}`;
}

/** The `Coordination` key that keeps when a workspace's stored queue was last found unreadable. */
export function queueLostKey(workspaceId: string): string {
  return `routines/${shortHash(workspaceId)}/queue-lost`;
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
