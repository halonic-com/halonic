import type { ToastStore } from "@halonicjs/studio-kit";
import type { FilesHost } from "./files-host.ts";
import { filesWords } from "./files-words.ts";

/** What is wrong with a typed name without asking the host. */
export function nameProblem(name: string): string | undefined {
  if (name.trim() === "") return filesWords.pathMissing;
  if (name.includes("/")) return filesWords.renameSlash;
  return undefined;
}

/** The folder of a path with its closing `/`, or nothing for a file at the top. */
function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/") + 1);
}

/** Where a rename of `from` to the typed `name` puts the file: the same folder, the new name. */
export function renamedPath(from: string, name: string): string {
  return `${folderOf(from)}${name.trim()}`;
}

/** What a rename tells the screen about. */
export interface RenameEffects {
  /** The file is at its new path now. */
  readonly moved: (to: string) => void;
  /** Undo moved it back to `from`. */
  readonly movedBack: (from: string) => void;
}

/**
 * Renames a file in its folder. Success shows a toast with Undo (and, when other files name the
 * file by its id, a second line that names the places it also updates) and resolves to nothing; a
 * name the host refuses resolves to the one sentence that says why, for the row to show.
 */
export async function renameFile(
  host: Pick<FilesHost, "rename">,
  toasts: ToastStore | null,
  from: string,
  name: string,
  effects: RenameEffects,
): Promise<string | undefined> {
  const own = nameProblem(name);
  if (own !== undefined) return own;
  const to = renamedPath(from, name);
  try {
    const renamed = await host.rename(from, to);
    effects.moved(to);
    toasts?.show({
      tone: "success",
      title: filesWords.renamed(to, renamed.places > 0),
      ...(renamed.places > 0
        ? { text: filesWords.alsoUpdated(renamed.places, renamed.owners) }
        : {}),
      action: {
        label: filesWords.undo,
        onClick: () => void moveBack(renamed.undo, from, to, toasts, effects),
      },
    });
    return undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.message.trim() : "";
    return reason === "" ? filesWords.couldntRename(to) : reason;
  }
}

async function moveBack(
  undo: () => Promise<void>,
  from: string,
  to: string,
  toasts: ToastStore | null,
  effects: RenameEffects,
) {
  try {
    await undo();
    effects.movedBack(from);
  } catch (error) {
    const reason = error instanceof Error ? error.message.trim() : "";
    toasts?.show({
      tone: "danger",
      title: filesWords.couldntMoveBack(to),
      ...(reason === "" ? {} : { text: reason }),
    });
  }
}
