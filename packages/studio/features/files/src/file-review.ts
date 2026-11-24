/**
 * The assistant's changes to review in a file, as the code editor marks them and its bar decides
 * them (AI changes 1.2, "In a file"; T14 PR 15). The app provides it over its review service;
 * where it doesn't, the file's tab finds no service and shows no marks and no bar.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** One part of the assistant's changes to review in a file: a group of lines. */
export interface FilePartToReview {
  /** The 1-based line of the saved file where the part's added lines start, or where its removed lines were. */
  readonly line: number;
  /** How many lines the assistant added there; 0 when it only removed lines. */
  readonly added: number;
  /** The lines the assistant removed there, each without its newline. */
  readonly removed: readonly string[];
}

/** The assistant's changes to review in one file, as last read. */
export interface FileReview {
  readonly path: string;
  /** The assistant created the file, so rejecting all of it deletes the file. */
  readonly created: boolean;
  /** In the order of the file's lines. */
  readonly parts: readonly FilePartToReview[];
  /**
   * Names the texts the parts were worked out from. A decision on a part passes it back, so a
   * click on a review that is out of date decides nothing and answers `stale`.
   */
  readonly seen: string;
}

/**
 * What one Accept or Reject did.
 *
 * - `done`: decided; `undo` puts it back as it was (`held` when the file changed since).
 * - `held`: the file changed outside Halonic since Halonic last saw it, so nothing was decided; it
 *   waits for **Compare** (review panel note 4).
 * - `stale`: the review was read before the file changed; nothing was decided. Read it again
 *   quietly and show the new one (note 1).
 */
export type FileReviewDecision =
  | { readonly status: "done"; readonly undo: () => Promise<"done" | "held"> }
  | { readonly status: "held" }
  | { readonly status: "stale" };

/** What a decision covers: one part of a review, or every change in the file. */
export type FileReviewTarget =
  | { readonly kind: "part"; readonly review: FileReview; readonly part: number }
  | { readonly kind: "file"; readonly path: string };

/** The assistant's changes to review in the workspace's files. */
export interface FileReviewHost {
  /** The changes to review in the saved file, or `null` when it has none. Rejects like `FilesHost.read`. */
  changesIn(path: string): Promise<FileReview | null>;
  /** Accepts what the target covers: the file stays as it is, and the change is no longer to review. */
  accept(target: FileReviewTarget): Promise<FileReviewDecision>;
  /** Rejects what the target covers: the file gets its lines from before the assistant's change back. */
  reject(target: FileReviewTarget): Promise<FileReviewDecision>;
  /**
   * Calls `listener` each time the file's changes to review may have changed: a write by the
   * assistant, a save, an Accept, a Reject or an Undo. Returns the way to stop.
   */
  subscribe(path: string, listener: () => void): () => void;
}

/** The changes to review in the open workspace's files, provided by the app (`files.review`). */
export const FileReviewService: ServiceKey<FileReviewHost> =
  serviceKey<FileReviewHost>("files.review");
