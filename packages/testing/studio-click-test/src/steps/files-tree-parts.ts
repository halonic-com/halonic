import type { TextInFile } from "../place-words.ts";
import { xpathString } from "../screen.ts";

const filesWordsFile = "packages/studio/features/files/src/files-words.ts";
const switchFile = "packages/studio/shell/src/sidebar/sidebar-views.tsx";

/**
 * The sidebar's Studio | Files switch (`shell.sidebar-switch`): its name and its two tabs. No words
 * entry point exports these, so `files-tree.test.ts` checks each is still in its file.
 */
export const sidebarSwitch = {
  label: { text: "Sidebar view", file: switchFile },
  studio: { text: "Studio", file: switchFile },
  files: { text: "Files", file: filesWordsFile },
} as const satisfies Record<string, TextInFile>;

/** The search field's name above the file tree, `filesWords.search`. */
export const searchFiles: TextInFile = { text: "Search files", file: filesWordsFile };

/**
 * The count under the search field, as `filesWords.searchCount` writes it; `files-tree.test.ts`
 * checks the words file still holds the same line.
 */
export function countWords(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

/** The Studio | Files switch itself, the kit's tab list by its name. */
export const sidebarSwitchList = `//*[@role='tablist' and @aria-label=${xpathString(sidebarSwitch.label.text)}]`;

/**
 * The panel the switch shows its picked view in. Every part is looked for under it: Code's page
 * draws the same view in its list column, so the window can hold a second "Files" tree with its
 * own "Search files" field.
 */
export const sidebarPanel = `${sidebarSwitchList}/following::*[@role='tabpanel'][1]`;

const tree = `${sidebarPanel}//*[@role='tree' and @aria-label=${xpathString(sidebarSwitch.files.text)}]`;
/** A file's row: a folder's says whether it is open, a file's doesn't (`files-tree.tsx`). */
const fileRows = `${tree}//*[@role='treeitem' and not(@aria-expanded)]`;
const search = `${sidebarPanel}//input[@type='search' and @aria-label=${xpathString(searchFiles.text)}]`;
/** The status region right under the field (`tree-search-status.tsx`), which stays in the page. */
const status = `${search}/following::*[@role='status'][1]`;
const capitals = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Where the parts of the sidebar's Files view are, as XPaths, each under {@link sidebarPanel}. */
export const filesTreeParts = {
  /** The tree itself, whose padding keeps the rows 10px inside the column. */
  tree,
  /** Every row the tree shows, folders and files. */
  rows: `${tree}//*[@role='treeitem']`,
  fileRows,
  /** The file rows with `text` in their path, whatever the case, as the search matches them. */
  fileRowsHolding: (text: string): string => {
    const path = `translate(@data-path, '${capitals}', '${capitals.toLowerCase()}')`;
    return `${fileRows}[contains(${path}, ${xpathString(text.toLowerCase())})]`;
  },
  /** The first row at a level of the tree, 1 for the top. */
  rowAtLevel: (level: number): string =>
    `(${tree}//*[@role='treeitem' and @aria-level='${level}'])[1]`,
  search,
  /** Each line the status region shows: the count, or the two lines when no file matches. */
  statusLines: `${status}//p`,
  /** The count line when it reads the words for `count` files. */
  countLine: (count: number): string =>
    `${status}//p[normalize-space()=${xpathString(countWords(count))}]`,
} as const;
