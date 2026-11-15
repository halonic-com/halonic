import { hasConflicts, mergedText, mergeLines } from "@halonicjs/std";

/** What the person chooses in Compare for a file that changed outside Halonic. */
export type CompareChoice = "keep-mine" | "use-other" | "combine-both";

/**
 * The two texts of a file that changed outside Halonic, for Compare to show
 * side by side. `null` is no file.
 */
export interface CompareView {
  readonly path: string;
  /** The text Halonic last read: what both sides started from. */
  readonly base: string | null;
  /** The text with the person's unsaved changes. */
  readonly mine: string | null;
  /** The text in the store now, changed outside Halonic. */
  readonly theirs: string | null;
  /**
   * The two texts put together, or `null` when they can't be: a side has no
   * file, or both changed the same lines or lines next to each other. Combine
   * both is offered only when this is not `null`.
   */
  readonly combined: string | null;
}

/** Thrown when Combine both is chosen and the two texts can't be put together. */
export class CannotCombineError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`"${path}" can't be combined: both sides changed the same lines.`);
    this.name = "CannotCombineError";
    this.path = path;
  }
}

/**
 * Builds the Compare view of a file: a three-way line merge of the two texts
 * over the text Halonic last read.
 *
 * @param path - the file, such as "providers/a.yaml"
 * @param base - the text Halonic last read, `null` for no file
 * @param mine - the text with the person's changes, `null` for a delete
 * @param theirs - the text in the store now, `null` when the file is gone
 */
export function compareTexts(
  path: string,
  base: string | null,
  mine: string | null,
  theirs: string | null,
): CompareView {
  return { path, base, mine, theirs, combined: combine(base, mine, theirs) };
}

function combine(base: string | null, mine: string | null, theirs: string | null): string | null {
  if (mine === null || theirs === null) return null;
  // A file Halonic read as missing has no lines to start from.
  const regions = mergeLines(base ?? "", mine, theirs);
  return hasConflicts(regions) ? null : mergedText(regions, "ours");
}
