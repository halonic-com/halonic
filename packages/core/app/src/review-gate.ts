// Which files the assistant may write (HAL-65 section F, rules A and B,
// HAL-3947). The review service asks before it touches the store, so a path
// it refuses is never read or written, whatever store sits behind it.

import { checkWorkspacePath, isPrivateWorkspacePath, segmentAsOpened } from "@halonicjs/ports";
import { placeOf } from "@halonicjs/workspace";

/**
 * Why the assistant may not write a file:
 * - `not-allowed`: never, in any mode: an unsafe path, a private one, one
 *   inside `.git/` or Halonic's own `.halonic/` (rule A), or a common
 *   credential file;
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

/** File names that commonly hold a credential, as {@link segmentAsOpened} gives them. */
const credentialNames: ReadonlySet<string> = new Set([
  ".npmrc",
  ".yarnrc.yml",
  ".netrc",
  "_netrc",
  ".pypirc",
  ".git-credentials",
  ".pgpass",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_ecdsa_sk",
  "id_ed25519_sk",
]);

/** File name endings of keys and certificates with their private key. */
const credentialEndings: readonly string[] = [".pem", ".key", ".p12", ".pfx"];

/** Folders whose every file may hold a credential. */
const credentialFolders: ReadonlySet<string> = new Set([".ssh", ".gnupg"]);

/** A folder and the file in it that holds a credential. */
const credentialFilesIn: ReadonlyMap<string, string> = new Map([
  [".aws", "credentials"],
  [".docker", "config.json"],
  [".kube", "config"],
]);

/**
 * Whether a path is a common credential file the assistant never reads or
 * writes (`assistant.build.no-credential-files`), even in a trusted
 * workspace, so a planted item can't get the model to send one to its
 * provider: `.npmrc`, `.netrc`, `.pypirc`, `.git-credentials`, an SSH key
 * such as `id_ed25519`, a `*.pem` or `*.key`, `.aws/credentials`, or
 * anything in `.ssh/`. Each segment is compared the way Windows and macOS
 * open it, so `.NPMRC.` counts as `.npmrc`. A path that is only a folder
 * counts too when it is `.ssh` or `.gnupg`.
 *
 * @example
 * isCredentialFile("hubs/h/.Npmrc"); // true
 * isCredentialFile("keys/id_ed25519.pub"); // false
 */
export function isCredentialFile(path: string): boolean {
  const segments = path.split("/").map(segmentAsOpened);
  const name = segments.at(-1) ?? "";
  const folder = segments.at(-2);
  return (
    credentialNames.has(name) ||
    credentialEndings.some((ending) => name.endsWith(ending)) ||
    segments.some((segment) => credentialFolders.has(segment)) ||
    (folder !== undefined && credentialFilesIn.get(folder) === name)
  );
}

/**
 * Why the assistant may not write `path` now, or `null` when it may.
 * While the workspace is untrusted, only a file that `placeOf` gives a kind
 * for may be written: an agent, a workflow, `models.yaml` and the like.
 * Any other path is `untrusted` then, `.envrc` and `.git/` included, so
 * the model reads the one answer the requirement gives while untrusted.
 * Rule A still refuses an item path that is never written, such as
 * `hubs/GIT~1/agents/a.agent.yaml`, in every mode, and so does the
 * credential rule ({@link isCredentialFile}).
 *
 * @param trusted - whether the workspace is trusted, read for this call
 */
export function proposalRefusal(path: string, trusted: boolean): ProposalRefusal | null {
  if (!trusted && placeOf(path) === undefined) {
    return "untrusted";
  }
  if (isNeverWritten(path) || isCredentialFile(path)) {
    return "not-allowed";
  }
  return null;
}

/** What {@link storeRefusing} gives when the store refused the path. */
export const refused = Symbol("refused");

/**
 * Runs one store call, giving {@link refused} for the `RangeError` the
 * `DefinitionStore` port throws for a path it won't serve, such as one
 * through a symlink or a junction: the real-path check the assistant's
 * writes and a run proposal's Accept share. Any other error is thrown.
 */
export async function storeRefusing<T>(call: () => Promise<T>): Promise<T | typeof refused> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof RangeError) {
      return refused;
    }
    throw error;
  }
}
