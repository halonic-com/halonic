/** The words the file tree shows (microcopy for the Files frames). */
export const filesWords = {
  treeLabel: "Files",
  loading: "Loading files",
  emptyTitle: "No files yet",
  emptyDescription: "Files you add to this workspace show here.",
  errorTitle: "Couldn't load files",
  retry: "Try again",
  retrying: "Checking…",
  /** The screen-reader name of an error count on a row. */
  errors: (count: number): string => `${count} ${count === 1 ? "error" : "errors"}`,
  warnings: (count: number): string => `${count} ${count === 1 ? "warning" : "warnings"}`,
  /** The "not saved" mark on a file, or on a folder with such a file in it. */
  outside: "Changed outside Halonic",
  /** The kind of a file's tab, as a screen reader reads it after the name. */
  fileKind: "file",
  fileLoading: "Loading the file",
  /** The editor's name for a screen reader: the file's path. */
  editorLabel: (path: string): string => `Text of ${path}`,
  missingTitle: "This file isn't here any more",
  missingDescription: "It was moved or deleted. Pick another file in the tree.",
  unreadableTitle: "Couldn't open this file",
  /** The strip above the editor of a file with unsaved changes that changed outside Halonic. */
  changedOutside: (name: string): string => `${name} changed outside Halonic`,
  deletedOutside: (name: string): string => `${name} was deleted outside Halonic.`,
  compare: "Compare",
  keepMine: "Keep mine",
  useOther: "Use the other one",
  combineBoth: "Combine both",
  close: "Close",
  cancel: "Cancel",
  compareMine: "Yours",
  compareTheirs: "In the folder now",
  compareNone: "No file",
  compareLoading: "Loading both texts",
  /** What shows when a choice in Compare can't be saved. */
  compareFailed: (reason: string): string => `Couldn't apply your choice: ${reason}`,
} as const;
