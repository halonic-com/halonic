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
 * Renames a file in its folder. Success shows a toast with Undo and resolves to nothing; the places
 * in other files it also updates were said under the name field while it was typed. A name the host
 * refuses resolves to the one sentence that says why, for the row to show.
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
    const reason = error instanceof Error ? error.message.trim() : "";
    return reason === "" ? filesWords.renameUnexplained : reason;
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

/**
 * The line under the name field for what typing `name` in place of `from` would do: the problem
 * with the name itself (empty, a slash, a name already taken), else nothing yet. `paths` are the
 * workspace's files.
 */
export function typedNameProblem(
  from: string,
  name: string,
  paths: readonly string[],
): string | undefined {
  const own = nameProblem(name);
  if (own !== undefined) return own;
  const to = renamedPath(from, name);
  return to !== from && paths.includes(to) ? filesWords.pathTaken(to) : undefined;
}

/** The line "Also updates 3 places: …" for the places a rename of `from` to `name` would change, or nothing. */
export async function renameImpactLine(
  host: Pick<FilesHost, "renameImpact">,
  from: string,
  name: string,
): Promise<string | undefined> {
  try {
    const impact = await host.renameImpact(from, renamedPath(from, name));
    return impact.places > 0 ? filesWords.alsoUpdates(impact.places, impact.owners) : undefined;
  } catch {
    return undefined;
  }
}
