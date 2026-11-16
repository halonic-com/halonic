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
} as const;
