import { useEffect, useState } from "react";
import type { OverviewItem } from "../overview/overview-model.ts";
import type {
  FilesWithErrorsSource,
  FileWithErrors,
  FileWithErrorsKind,
} from "./files-with-errors.ts";

/** The words of a broken file's row and its ⋮ menu (C348). */
export const brokenFileWords = {
  /** The row's chip: "1 problem", "3 problems". */
  problems: (count: number) => (count === 1 ? "1 problem" : `${count} problems`),
  /** The row's reason, under its name: "Line 2: A value has ": " in it." */
  reason: ({ line, reason }: FileWithErrors["firstError"]) => `Line ${line}: ${reason}`,
  openFile: "Open file",
  showInFiles: "Show in Files",
  /** No dialog, as the file tree deletes: the toast's Undo brings the file back. */
  delete: "Delete",
} as const;

/** The last part of a path: `writer.agent.yaml`. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * The overview row of a file that didn't load: its name, the kit's error state with the problem
 * count and the first error's line and reason, and its file name as the description, so the
 * search finds it by either. The feature adds its avatar and its ⋮ menu.
 *
 * @example
 * { ...brokenFileItem(file, `${file.hub}/${file.id}`), avatar: <LetterTile name={file.name} /> }
 */
export function brokenFileItem(file: FileWithErrors, id: string): OverviewItem {
  return {
    id,
    name: file.name,
    description: fileName(file.path),
    error: {
      chip: brokenFileWords.problems(file.errors),
      reason: brokenFileWords.reason(file.firstError),
    },
  };
}

/**
 * The files of one kind that didn't load, from the shared list, read again whenever it changes.
 * Empty without a source and before the first read: the list then shows only what loaded.
 */
export function useBrokenFiles(
  source: FilesWithErrorsSource | undefined,
  kind: FileWithErrorsKind,
): readonly FileWithErrors[] {
  const [broken, setBroken] = useState<readonly FileWithErrors[]>([]);
  useEffect(() => {
    if (source === undefined) return;
    let newest = 0;
    const read = () => {
      const mine = ++newest;
      source.list().then(
        (files) => {
          if (mine === newest)
            setBroken(files.filter((file) => file.kind === kind && !file.loaded));
        },
        // The rows from before stay, as the list keeps its own rows: the list's read of the same
        // files says when the workspace can't be read.
        () => undefined,
      );
    };
    read();
    const stop = source.subscribe(read);
    return () => {
      newest += 1;
      stop();
    };
  }, [source, kind]);
  return broken;
}
