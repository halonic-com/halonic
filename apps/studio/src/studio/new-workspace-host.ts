import type { TauriFileShell } from "@halonicjs/adapter-fs-tauri";
import { TauriDefinitionStore } from "@halonicjs/adapter-fs-tauri";
import type { DefinitionStore } from "@halonicjs/ports";
import type { CreatedTrust, NewWorkspaceHost } from "@halonicjs/studio-feature-workspace";
import { createWorkspace } from "@halonicjs/workspace";

/** The shell's commands for a new workspace's folder (`create_workspace_folder` and its two helpers). */
const commands = {
  documents: "documents_folder",
  pickParent: "pick_parent_folder",
  create: "create_workspace_folder",
} as const;

/** What {@link newWorkspaceHostOf} needs of the desktop app. */
export interface NewWorkspaceHostParts {
  /** The shell's IPC; the folder commands and, through the file commands, the new folder's files. */
  readonly shell: TauriFileShell;
  /** The store `createWorkspace` writes through, for the folder the shell opened. */
  readonly storeOf?: (folder: string) => DefinitionStore;
  /**
   * Saves the person's trust in the new folder, as they would after reading what it holds: it
   * reads the folder and grants exactly what it finds. Rejects with why it couldn't.
   */
  readonly trust: (folder: string) => Promise<void>;
  /** The path separator of this computer, `/` or `\`, from the platform. */
  readonly separator: "/" | "\\";
}

/**
 * The app's side of the New workspace dialog (`studio.new-workspace`): where Documents is, the
 * folder picker for the parent, and making the folder through the shell and laying the workspace
 * out in it with `createWorkspace`, the template `halonic init` uses. A workspace the template
 * wrote whole is trusted at once; if any file was skipped, or the record can't be saved, it opens
 * untrusted and the dialog says which.
 *
 * The shell never adopts a folder that exists, so a folder that is there can't be created in or
 * opened from this dialog: {@link NewWorkspaceHost.probe} says `new`, and `create` is refused as
 * "already there" (see the requirement's Not yet).
 *
 * @example
 * const host = newWorkspaceHostOf({ shell, trust, separator: "/" });
 */
export function newWorkspaceHostOf(parts: NewWorkspaceHostParts): NewWorkspaceHost {
  const { shell, separator } = parts;
  const storeOf = parts.storeOf ?? ((folder) => new TauriDefinitionStore(shell, folder));
  return {
    defaultParent: async () => {
      const documents = await shell.invoke(commands.documents);
      if (typeof documents !== "string") {
        throw new Error("This computer has no Documents folder; choose a folder.");
      }
      return documents;
    },
    pickParent: async () => {
      const picked = await shell.invoke(commands.pickParent);
      return typeof picked === "string" ? picked : undefined;
    },
    folderOf: (parent, name) =>
      parent.endsWith(separator) ? `${parent}${name}` : `${parent}${separator}${name}`,
    probe: async () => "new",
    create: async (folder, name) => {
      const parent = parentOf(folder, name);
      const made = await madeFolder(shell, parent, name);
      const created = await createWorkspace(storeOf(made), { name, ifNotEmpty: "refuse" });
      if (!created.ok) {
        throw new Error(
          created.error.kind === "invalid_settings"
            ? "the name can't be a workspace name"
            : "the folder isn't empty",
        );
      }
      return await trustOf(parts, made, created.value.skipped.length === 0);
    },
  };
}

/** Whether `path` is a filesystem root: `/`, `\\`, or a drive root such as `D:\\` or `D:/`. */
function isRoot(path: string): boolean {
  return /^([\\/]|[A-Za-z]:[\\/])$/.test(path);
}

/**
 * The parent {@link NewWorkspaceHost.folderOf} joined `name` to: cut only the name, then drop the
 * separator before it unless what is left is a root (`/`, `D:\\`), which keeps its own.
 */
function parentOf(folder: string, name: string): string {
  const head = folder.endsWith(name) ? folder.slice(0, folder.length - name.length) : folder;
  return head.length > 1 && !isRoot(head) ? head.slice(0, -1) : head;
}

/** Makes the folder through the shell; a refusal becomes the reason the dialog shows. */
async function madeFolder(shell: TauriFileShell, parent: string, name: string): Promise<string> {
  try {
    const made = await shell.invoke(commands.create, { parent, name });
    if (typeof made !== "string") throw new Error("the desktop shell gave no answer");
    return made;
  } catch (reason) {
    throw new Error(reasonOf(reason));
  }
}

/** The words for a refusal of `create_workspace_folder`; anything else is an unknown failure. */
export function reasonOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason !== "object" || reason === null) return "the desktop shell refused";
  const { kind, reason: why } = reason as { kind?: unknown; reason?: unknown };
  switch (kind) {
    case "exists":
      return "a folder with that name is already there";
    case "parent_not_chosen":
      return "that isn't a folder you chose";
    case "parent_private":
      return "Halonic keeps its own files there";
    case "folder_missing":
      return "the folder isn't there any more";
    case "name_invalid":
      return why === "empty" ? "the name is empty" : "that isn't a name a folder can have";
    default:
      return "you don't have permission";
  }
}

/** Saves the trust of a folder the template wrote whole; a failure is reported, not thrown. */
async function trustOf(
  parts: NewWorkspaceHostParts,
  folder: string,
  whole: boolean,
): Promise<CreatedTrust> {
  if (!whole) return { kind: "untrusted" };
  try {
    await parts.trust(folder);
    return { kind: "trusted" };
  } catch (error) {
    return { kind: "not-saved", reason: error instanceof Error ? error.message : String(error) };
  }
}
