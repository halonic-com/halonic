import { KindedError } from "@halonicjs/std";

/** What {@link deleteWithUndo} needs of the kernel's `WorkspaceFiles`. */
export interface UndoableDeleteFiles {
  /** Reads with unsaved changes applied; `null` when the file isn't there. */
  read(path: string): Promise<string | null>;
  change(label: string, changes: Record<string, string | null>): void;
  /** The kernel's `WorkspaceFiles.undo`: `false` when there was nothing to undo. */
  undo(): boolean;
  /** The kernel's `WorkspaceFiles.step`: moves on every change, so it tells a step is still the newest. */
  readonly step: number;
}

/** What is deleted: the files, and how the change names them. */
export interface DeletedItem {
  /** The files that go, as one change. A path that isn't there is left out. */
  readonly paths: readonly string[];
  /** What the change names, after "Deleted" and "Put back": "workflow Reply", "notes.md". */
  readonly what: string;
}

/** The way back from {@link deleteWithUndo}. */
export interface UndoableDelete {
  /** Puts the files back as they were; rejects with `conflict`, writing nothing, when it can't. */
  undo(): Promise<void>;
}

/**
 * Deletes the item's files as one change, and gives the way back. While the delete is still the
 * newest change, the way back is the workspace's undo. After another change it writes the files back
 * as they were, as a change of its own, so a later edit doesn't lose the item for good. When they
 * are back already, undone some other way, it does nothing, and when only some are back with their
 * old text, it writes only the missing ones. It refuses, and writes nothing, only when a file with
 * other text has since taken one of their places, and names that file.
 */
export async function deleteWithUndo(
  files: UndoableDeleteFiles,
  { paths, what }: DeletedItem,
): Promise<UndoableDelete> {
  const kept = await readAll(files, paths);
  files.change(
    `Deleted ${what}`,
    Object.fromEntries(Object.keys(kept).map((path) => [path, null])),
  );
  const afterDelete = files.step;
  let back = false;
  return {
    undo: async () => {
      if (back) return;
      if (files.step === afterDelete && files.undo()) {
        back = true;
        return;
      }
      const now = await readAll(files, Object.keys(kept));
      // Undone some other way already, such as the workspace's own undo: nothing is left to do.
      if (Object.entries(kept).every(([path, text]) => now[path] === text)) {
        back = true;
        return;
      }
      // A file that is back with the same text, in a partly restored item, is the item's own.
      const taken = Object.keys(kept).find(
        (path) => now[path] !== undefined && now[path] !== kept[path],
      );
      if (taken !== undefined) {
        throw new KindedError(
          "conflict",
          `There's a new ${taken} in its place. Rename or move the new one, then undo again.`,
        );
      }
      const missing = Object.entries(kept).filter(([path]) => now[path] === undefined);
      files.change(`Put back ${what}`, Object.fromEntries(missing));
      back = true;
    },
  };
}

/** The text of each of `paths` that is there, by its path. */
async function readAll(
  files: UndoableDeleteFiles,
  paths: readonly string[],
): Promise<Record<string, string>> {
  const texts = await Promise.all(paths.map((path) => files.read(path)));
  return Object.fromEntries(
    paths.flatMap((path, index) => {
      const text = texts[index];
      return text === null || text === undefined ? [] : [[path, text]];
    }),
  );
}
