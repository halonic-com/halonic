import { filesWords } from "../files-words.ts";

/** Props for {@link TreeSearchStatus}. */
export interface TreeSearchStatusProps {
  /** Whether the search field holds text to search for. */
  readonly searching: boolean;
  /** The text searched for, as the person typed it. */
  readonly typed: string;
  /** How many files match. */
  readonly matches: number;
}

/**
 * What the search found, under the search field (requirement `files.ui.tree-search`): "3 files"
 * above the tree, or the two lines that stand in for the tree when no file matches. It is one
 * status region that stays in the page, so a screen reader reads each new count as it changes.
 */
export function TreeSearchStatus({ searching, typed, matches }: TreeSearchStatusProps) {
  return (
    <div role="status" className="px-5">
      {searching && matches > 0 && (
        <p className="pb-1 text-caption text-fg-subtle">{filesWords.searchCount(matches)}</p>
      )}
      {searching && matches === 0 && (
        <div className="pt-10 text-center">
          <p className="text-body-strong">{filesWords.noMatchTitle(typed.trim())}</p>
          <p className="mt-1 text-small text-fg-muted">{filesWords.noMatchDescription}</p>
        </div>
      )}
    </div>
  );
}
