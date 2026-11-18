import type { ToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
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

/**
 * What is wrong with the name typed so far, for the line under the rename field, checked as the
 * user types: a name that is empty, has a slash, or is taken by a file or folder at the new path.
 * Nothing for the name the file already has.
 */
export function typedNameProblem(
  from: string,
  name: string,
  paths: readonly string[],
): string | undefined {
  const own = nameProblem(name);
  if (own !== undefined) return own;
  const to = renamedPath(from, name);
  if (to === from) return undefined;
  if (paths.includes(to)) return filesWords.pathTaken(to);
  if (paths.some((path) => path.startsWith(`${to}/`))) return filesWords.pathFolder(to);
  return undefined;
}

/** What a rename tells the screen about. */
export interface RenameEffects {
  /** The file is at its new path now. */
  readonly moved: (to: string) => void;
  /** Undo moved it back to `from`. */
  readonly movedBack: (from: string) => void;
}

/**
 * Renames a file in its folder. Success shows a toast with Undo and resolves to nothing; the places
 * in other files it also updates are said under the field while the name is typed. A
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
      title: filesWords.renamed(to),
      action: {
        label: filesWords.undo,
        onClick: () => void moveBack(renamed.undo, from, to, toasts, effects),
      },
    });
    return undefined;
  } catch (error) {
    const reason = errorReasonFor(error, "");
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
    const reason = errorReasonFor(error, "");
    toasts?.show({
      tone: "danger",
      title: filesWords.couldntMoveBack(to),
      ...(reason === "" ? {} : { text: reason }),
    });
  }
}
