import type { MenuEntry, ToastStore } from "@halonicjs/studio-kit";
import {
  brokenFileWords,
  type FileWithErrors,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { FILES_VIEW, fileItem } from "./file-item.ts";
import { FilesHostService } from "./files-host.ts";
import { requestOpenAtLine } from "./open-at-line.ts";
import { type RemoveFocus, removeFile } from "./remove-file.ts";
import { requestFilesReveal } from "./reveal-request.ts";

/** What a broken file's row can do with its file; an action the window can't do is absent. */
export interface BrokenFileActions {
  /** Opens the file's tab with the cursor on its first error (C348 A3). */
  readonly open?: (file: FileWithErrors) => void;
  /** Shows the Files view with the file's row focused; the desktop only, which has the view. */
  readonly showInFiles?: (file: FileWithErrors) => void;
  /** Deletes the file as the file tree does: no dialog, and a toast with Undo (`files.ui.delete-file`). */
  readonly remove?: (file: FileWithErrors, focus?: RemoveFocus) => void;
}

/**
 * The actions of a broken file's row and its ⋮ menu (Agents, Workflows, Routines and Library ›
 * Connectors), from what the window gives the page. A file that didn't load has no page, so they
 * all work on the file itself. The feature lists `FilesHostService` in its `wants` for `remove`.
 *
 * @example
 * const actions = brokenFileActions(context, toasts);
 * actions.open?.(file); // writer.agent.yaml, cursor on line 2
 */
export function brokenFileActions(
  {
    openItem,
    showSidebarView,
    services,
  }: Pick<WorkspaceContext, "openItem" | "showSidebarView" | "services">,
  toasts: ToastStore | null,
): BrokenFileActions {
  const host = services.find(FilesHostService);
  return {
    ...(openItem === undefined
      ? {}
      : {
          open: (file: FileWithErrors) => {
            requestOpenAtLine(file.path, file.firstError.line);
            openItem(fileItem(file.path));
          },
        }),
    ...(showSidebarView === undefined
      ? {}
      : {
          showInFiles: (file: FileWithErrors) => {
            void requestFilesReveal(file.path);
            showSidebarView(FILES_VIEW);
          },
        }),
    ...(host === undefined
      ? {}
      : {
          remove: (file: FileWithErrors, focus?: RemoveFocus) =>
            void removeFile(host, toasts, file.path, focus),
        }),
  };
}

/**
 * The ⋮ menu of a broken file's row: **Open file**, **Show in Files** and **Delete**, each only
 * when the window can do it. Run, Duplicate and the like need a readable file, so it has none.
 *
 * @example
 * itemMenu={(row) => brokenOf(row.id) ? brokenFileMenu(brokenOf(row.id), actions) : rowMenu(row)}
 */
export function brokenFileMenu(
  file: FileWithErrors,
  { open, showInFiles, remove }: BrokenFileActions,
  focus?: RemoveFocus,
): MenuEntry[] {
  return [
    ...(open === undefined
      ? []
      : [{ id: "open-file", label: brokenFileWords.openFile, onSelect: () => open(file) }]),
    ...(showInFiles === undefined
      ? []
      : [
          {
            id: "show-in-files",
            label: brokenFileWords.showInFiles,
            onSelect: () => showInFiles(file),
          },
        ]),
    ...(remove === undefined
      ? []
      : [
          {
            id: "delete",
            label: brokenFileWords.delete,
            danger: true,
            onSelect: () => remove(file, focus),
          },
        ]),
  ];
}
