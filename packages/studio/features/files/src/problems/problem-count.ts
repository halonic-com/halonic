// The workspace's problem count (C348 ST5, HAL-14903): the status bar's item on the desktop and the
// strip on a phone read the shared list of files with errors (HAL-14902), so they count the same
// files as the lists and Home.

import type { MenuItem } from "@halonicjs/studio-kit";
import {
  FilesWithErrorsService,
  type FileWithErrors,
  useFilesWithErrorsReading,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { useEffect, useRef } from "react";
import { fileItem } from "../file-item.ts";
import { requestOpenAtLine } from "../open-at-line.ts";
import { problemsWords } from "./problems-words.ts";

const noFiles: readonly FileWithErrors[] = [];

/** The key of the count's announcement, so a burst of changes is said once, after it settles. */
const ANNOUNCE_KEY = "files.problems";

/**
 * The open workspace's files with errors. With `announce`, a change of the count after the first
 * read is said once, politely ("5 files with problems", at zero "No files with problems"); the
 * first read says nothing, since the count is on screen.
 */
export function useProblemFiles(
  context: WorkspaceContext,
  announce: boolean,
): readonly FileWithErrors[] {
  const files = useFilesWithErrorsReading(context.services.find(FilesWithErrorsService));
  const said = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Before the first read there is no count yet.
    if (files === undefined) return;
    const before = said.current;
    said.current = files.length;
    if (!announce || before === undefined || before === files.length) return;
    const text = files.length === 0 ? problemsWords.none : problemsWords.count(files.length);
    context.announcer.announceState(ANNOUNCE_KEY, text);
  }, [files, announce, context.announcer]);
  return files ?? noFiles;
}

/**
 * Opens a file in Files with the cursor on its first problem (`files.ui.open-at-line`): a tab on
 * the desktop, a page on a phone.
 */
export function openAtFirstProblem(context: WorkspaceContext, file: FileWithErrors): void {
  requestOpenAtLine(file.path, file.firstError.line);
  context.openItem?.(fileItem(file.path));
}

/**
 * The menu's and the sheet's entries, one per file in the list's order: its name, "Line N:
 * *reason*" under it, and its kind as a tag. Picking one opens the file at its first problem.
 */
export function problemEntries(
  files: readonly FileWithErrors[],
  open: (file: FileWithErrors) => void,
): MenuItem[] {
  return files.map((file) => ({
    id: file.path,
    label: file.name,
    detail: problemsWords.line(file.firstError.line, file.firstError.reason),
    tag: problemsWords.kinds[file.kind],
    onSelect: () => open(file),
  }));
}
