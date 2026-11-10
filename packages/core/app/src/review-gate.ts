// Which files the assistant may write (HAL-65 section F, rules A and B,
// HAL-3947). The review service asks before it touches the store, so a path
// it refuses is never read or written, whatever store sits behind it.

import { checkWorkspacePath, isPrivateWorkspacePath, segmentAsOpened } from "@halonicjs/ports";
import { placeOf } from "@halonicjs/workspace";

/**
 * Why the assistant may not write a file:
 * - `not-allowed`: never, in any mode: an unsafe path, a private one, or one
 *   inside `.git/` or Halonic's own `.halonic/` (rule A);
 * - `untrusted`: not while the workspace is untrusted, because it isn't a
 *   Halonic item file (rule B).
 *
 * The `propose_file` and `propose_delete` tools turn these into the words
 * the model reads.
 */
export type ProposalRefusal = "not-allowed" | "untrusted";

/** Folder names the assistant never writes into, as the port's private rule compares names. */
const forbiddenFolders: ReadonlySet<string> = new Set([".git", ".halonic"]);

/**
 * Whether a path is one the assistant may never write (rule A): unsafe
 * (absolute, `..`, `.` or empty segments, a backslash or NUL), private as
 * the `DefinitionStore` port defines it (`.env*`, `.envrc`, NTFS streams,
 * 8.3 short names such as `GIT~1`), or with any segment that opens as
 * `.git` or `.halonic` on Windows or macOS (`.Halonic./x`, `hubs/h/.HALONIC/x`).
 *
 * @example
 * isNeverWritten(".Halonic./review/x.json"); // true
 * isNeverWritten("agents/clerk.agent.yaml"); // false
 */
export function isNeverWritten(path: string): boolean {
  try {
    checkWorkspacePath(path);
  } catch {
    return true;
  }
  return (
    isPrivateWorkspacePath(path) ||
    path.split("/").some((segment) => forbiddenFolders.has(segmentAsOpened(segment)))
  );
}

/**
 * Why the assistant may not write `path` now, or `null` when it may.
 * While the workspace is untrusted, only a file that `placeOf` gives a kind
 * for may be written: an agent, a workflow, `models.yaml` and the like.
 * Any other path is `untrusted` then, `.envrc` and `.git/` included, so
 * the model reads the one answer the requirement gives while untrusted.
 * Rule A still refuses an item path that is never written, such as
 * `hubs/GIT~1/agents/a.agent.yaml`, in every mode.
 *
 * @param trusted - whether the workspace is trusted, read for this call
 */
export function proposalRefusal(path: string, trusted: boolean): ProposalRefusal | null {
  if (!trusted && placeOf(path) === undefined) {
    return "untrusted";
  }
  if (isNeverWritten(path)) {
    return "not-allowed";
  }
  return null;
}
