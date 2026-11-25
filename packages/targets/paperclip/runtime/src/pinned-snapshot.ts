import { readSnapshot, type WorkspaceSnapshot } from "@halonicjs/format";
import { bytesToHex, decodeBase64url, decodeUtf8 } from "@halonicjs/std";
import { checkState, type GitHubGet } from "./github.ts";

/**
 * Fetches the snapshot CI built for one pinned workspace commit. The plugin
 * never builds a snapshot and never follows a branch: it takes only the file
 * for the pinned commit, and only when the workspace check on that commit is
 * green, the file's sha-256 is the pinned one and the snapshot passes every
 * check `readSnapshot` runs. Every request is a GET to the GitHub API.
 */

/** Which snapshot the plugin settings pin, and where CI keeps it. */
export interface SnapshotPin {
  /** The workspace repository, as owner/name. */
  readonly repo: string;
  /** The workspace commit the snapshot was built from. */
  readonly commit: string;
  /**
   * The SHA-256 of `snapshot.json` in the plugin file built from the pinned commit, as its release
   * file's `snapshotSha256` says: 64 hex characters.
   */
  readonly sha256: string;
  /** The branch or tag where CI keeps built snapshots, one file per commit. */
  readonly ref: string;
  /** The workspace check that must be green on the commit. */
  readonly check: string;
}

/** Where CI keeps the snapshot of one commit, on the pin's ref. */
export function snapshotPath(commit: string): string {
  return `snapshots/${commit}.json`;
}

/** The sha-256 of some bytes, as lowercase hex, with WebCrypto. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

/**
 * Checks snapshot data with `readSnapshot` and returns it, or throws with
 * every problem found. A refused snapshot is never used in part.
 */
export function checkedSnapshot(data: unknown): WorkspaceSnapshot {
  const read = readSnapshot(data);
  if (!read.ok) {
    const problems = read.error.map((problem) => `${problem.path.join(".")}: ${problem.message}`);
    throw new Error(`The snapshot is refused: ${problems.join("; ")}.`);
  }
  return read.value;
}

/** The file's bytes from a contents API answer, which carries them as base64. */
function fileBytes(answer: unknown): Uint8Array<ArrayBuffer> {
  const { content, encoding } = (answer ?? {}) as { content?: unknown; encoding?: unknown };
  if (encoding !== "base64" || typeof content !== "string") {
    throw new Error("GitHub didn't send the snapshot file's content.");
  }
  // GitHub sends standard base64 in lines; std reads the URL-safe alphabet without padding.
  const urlSafe = content
    .replace(/\s/g, "")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  const bytes = decodeBase64url(urlSafe);
  if (bytes === undefined) {
    throw new Error("GitHub sent the snapshot file's content in a form that isn't base64.");
  }
  return bytes;
}

/** The pinned snapshot, or an error saying which condition failed. */
export async function fetchPinnedSnapshot(
  get: GitHubGet,
  pin: SnapshotPin,
): Promise<WorkspaceSnapshot> {
  const check = await checkState(get, pin.repo, pin.commit, pin.check);
  if (check !== "success") {
    throw new Error(`The workspace check ${pin.check} on ${pin.commit} is ${check}, not green.`);
  }
  const answer = await get(
    `/repos/${pin.repo}/contents/${snapshotPath(pin.commit)}?ref=${encodeURIComponent(pin.ref)}`,
  );
  const bytes = fileBytes(answer);
  const sha256 = await sha256Hex(bytes);
  if (sha256 !== pin.sha256) {
    throw new Error(`The snapshot's sha-256 is ${sha256}, not the pinned ${pin.sha256}.`);
  }
  const snapshot = checkedSnapshot(JSON.parse(decodeUtf8(bytes)));
  if (snapshot.workspace.commit !== pin.commit) {
    throw new Error(
      `The snapshot was built from ${snapshot.workspace.commit}, not the pinned ${pin.commit}.`,
    );
  }
  return snapshot;
}
