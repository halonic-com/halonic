import type { TauriFileShell, WorkspaceFolderProbe } from "@halonicjs/adapter-fs-tauri";
import { TauriDefinitionStore, workspaceFolderCommands } from "@halonicjs/adapter-fs-tauri";
import type { DefinitionStore } from "@halonicjs/ports";
import {
  type CreatedTrust,
  type FolderState,
  type NewWorkspaceHost,
  NewWorkspaceRefusal,
} from "@halonicjs/studio-feature-workspace";
import { createWorkspace } from "@halonicjs/workspace";

/** The shell's commands for a new workspace's folder (`create_workspace_folder`, its two helpers, and the probe and open of a folder that is there). */
const commands = {
  documents: "documents_folder",
  pickParent: "pick_parent_folder",
  create: "create_workspace_folder",
  ...workspaceFolderCommands,
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
 * A folder that is there is read by name only (`probe_workspace_folder`) and opened only after the
 * shell itself asks the person to trust it (`open_workspace_folder`, HAL-8859). Creating in one
 * adds only the missing files and opens it untrusted, since Halonic didn't write all it holds, unless
 * it was empty, which is trusted at once like a new folder; if they say no, nothing is written.
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
    probe: async (folder) => {
      const { parent, name } = splitFolder(folder, separator);
      return stateOf(await probed(shell, parent, name));
    },
    open: async (folder) => {
      const { parent, name } = splitFolder(folder, separator);
      return (await openedFolder(shell, parent, name)) ?? undefined;
    },
    create: async (folder, name) => {
      const parent = parentOf(folder, name);
      const there = await probed(shell, parent, name);
      if (there === "empty" || there === "files" || there === "workspace") {
        return await addedTo(parts, storeOf, parent, name, there);
      }
      const made = await madeFolder(shell, parent, name);
      const created = await createWorkspace(storeOf(made), { name, ifNotEmpty: "refuse" });
      if (!created.ok) {
        throw created.error.kind === "invalid_settings"
          ? new NewWorkspaceRefusal("the name can't be a workspace name", "name")
          : new NewWorkspaceRefusal("the folder isn't empty");
      }
      return await trustOf(parts, made, created.value.skipped.length === 0);
    },
  };
}

/**
 * Adds the missing files to a folder that is there, after the shell asks the person. A folder
 * with files opens untrusted, since Halonic didn't write all it holds; an empty one holds only
 * what the template wrote, so it is trusted at once. A workspace that is there needs nothing added.
 */
async function addedTo(
  parts: NewWorkspaceHostParts,
  storeOf: (location: string) => DefinitionStore,
  parent: string,
  name: string,
  there: WorkspaceFolderProbe,
): Promise<CreatedTrust> {
  const opened = await openedFolder(parts.shell, parent, name);
  if (opened === null) return { kind: "cancelled" };
  if (there === "workspace") return { kind: "untrusted" };
  const added = await createWorkspace(storeOf(opened), { name });
  // `already_workspace`: it became one since the probe; it is open and there is nothing to add.
  if (!added.ok && added.error.kind !== "already_workspace") {
    throw new NewWorkspaceRefusal("the name can't be a workspace name", "name");
  }
  // An empty folder holds only what the template wrote, so it is trusted at once like a new one.
  if (there === "empty" && added.ok)
    return await trustOf(parts, opened, added.value.skipped.length === 0);
  return { kind: "untrusted" };
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

/** What the dialog shows for what the probe found: an empty folder is made like a new one. */
function stateOf(found: WorkspaceFolderProbe): FolderState {
  if (found === "files") return "not-empty";
  return found === "workspace" ? "workspace" : "new";
}

/** `<parent>` and `<name>` of a folder the host's `folderOf` made: the name follows the last separator. */
function splitFolder(folder: string, separator: string): { parent: string; name: string } {
  const name = folder.slice(folder.lastIndexOf(separator) + 1);
  return { parent: parentOf(folder, name), name };
}

/** What the shell found at `<parent>/<name>`; a refusal becomes the reason the dialog shows. */
async function probed(
  shell: TauriFileShell,
  parent: string,
  name: string,
): Promise<WorkspaceFolderProbe> {
  try {
    return (await shell.invoke(commands.probe, { parent, name })) as WorkspaceFolderProbe;
  } catch (reason) {
    throw refusalOf(reason);
  }
}

/** Opens the folder after the shell asks the person; `null` when they say no. */
async function openedFolder(
  shell: TauriFileShell,
  parent: string,
  name: string,
): Promise<string | null> {
  try {
    const opened = await shell.invoke(commands.open, { parent, name });
    if (opened === null) return null;
    if (typeof opened !== "string") throw new Error("the desktop shell gave no answer");
    return opened;
  } catch (reason) {
    throw refusalOf(reason);
  }
}

/** Makes the folder through the shell; a refusal becomes the reason the dialog shows. */
async function madeFolder(shell: TauriFileShell, parent: string, name: string): Promise<string> {
  try {
    const made = await shell.invoke(commands.create, { parent, name });
    if (typeof made !== "string") throw new Error("the desktop shell gave no answer");
    return made;
  } catch (reason) {
    throw refusalOf(reason);
  }
}

/** The refusal the dialog shows: a name problem goes under Name, the rest under Folder. */
function refusalOf(reason: unknown): Error {
  const kind =
    typeof reason === "object" && reason !== null ? (reason as { kind?: unknown }).kind : undefined;
  return new NewWorkspaceRefusal(reasonOf(reason), kind === "name_invalid" ? "name" : "folder");
}

/** The words for a refusal of `create_workspace_folder`; any other refusal is shown as given. */
export function reasonOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason !== "object" || reason === null) return "the desktop shell refused";
  const {
    kind,
    reason: why,
    message,
  } = reason as { kind?: unknown; reason?: unknown; message?: unknown };
  switch (kind) {
    case "exists":
      return "a folder with that name is already there";
    case "parent_not_chosen":
      return "that isn't a folder you chose";
    case "parent_private":
      return "Halonic keeps its own files there";
    case "folder_missing":
      return "the folder isn't there any more";
    case "folder_changed":
      return "the folder changed while you were asked";
    case "busy":
      return "another question is waiting for your answer";
    case "name_invalid":
      return why === "empty" ? "the name is empty" : "that isn't a name a folder can have";
    default:
      // Any other refusal is shown as the shell gave it, never guessed to be a permission problem.
      return typeof message === "string" && message !== "" ? message : "the desktop shell refused";
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
