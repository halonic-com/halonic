import { type LibraryItemKind, whoUses } from "@halonicjs/app";
import type { DefinitionSource } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type {
  LibraryEntry,
  LibraryItemPlace,
  LibraryItemsHost,
  LibraryListing,
  RemovedLibraryItem,
} from "@halonicjs/studio-feature-library/api";
import {
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  loadWorkspace,
} from "@halonicjs/workspace";

/** What {@link WorkspaceLibraryItems} needs of the workspace's files. */
export interface WorkspaceLibraryItemsParts {
  /** The kernel's `WorkspaceFiles`: reads and lists with unsaved changes applied. */
  readonly files: {
    read(path: string): Promise<string | null>;
    list(dir: string): Promise<string[]>;
  };
  /** Calls `listener` after every change of the workspace's files; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
}

/**
 * The folders the Library's rows and their "Used by" read: the hubs, and at the workspace root
 * the shared library items, agents and workflows (where routines live).
 */
const folders = ["hubs", "library", "agents", "workflows"];

/** What {@link WorkspaceLibraryItems} needs: the reads, and the kernel's way to change and undo. */
export interface WorkspaceLibraryItemsHostParts extends WorkspaceLibraryItemsParts {
  readonly files: WorkspaceLibraryItemsParts["files"] & {
    /** The kernel's `WorkspaceFiles.change`: `null` deletes the file when saved, into the trash. */
    change(label: string, changes: Record<string, string | null>): void;
    /** The kernel's `WorkspaceFiles.undo`: `false` when there was nothing to undo. */
    undo(): boolean;
    /** The kernel's `WorkspaceFiles.step`: moves on every change to the undo steps, not on a save, so it tells a step is still the newest. */
    readonly step: number;
  };
}

const settingsPath = "workspace.yaml";

type Item = LoadedFileOf<LibraryItemKind>;

/** The row's one line: a collection counts its fields; the others say what they are for. */
function detailOf(item: Item): string | undefined {
  if ("fields" in item.value) {
    const count = Object.keys(item.value.fields).length;
    return `${count} ${count === 1 ? "field" : "fields"}`;
  }
  return item.value.description;
}

/**
 * The Library's items (`studio.workspace-library-items`), read from the workspace's files with
 * their unsaved changes, so a new item shows at once. Each entry carries who uses it, from core's
 * `whoUses`. Nothing here needs the engine.
 *
 * @example
 * services.provide(LibraryItemsHostService, new WorkspaceLibraryItems({ files, onChange }));
 */
export class WorkspaceLibraryItems implements LibraryItemsHost {
  readonly #parts: WorkspaceLibraryItemsHostParts;

  constructor(parts: WorkspaceLibraryItemsHostParts) {
    this.#parts = parts;
  }

  async list(kind: LibraryItemKind): Promise<LibraryListing> {
    const workspace = await loadWorkspace(this.#source());
    const items = filesOf(workspace, kind) as Item[];
    const entryOf = (item: Item): LibraryEntry => {
      const detail = detailOf(item);
      return {
        id: item.value.id,
        name: item.value.name ?? item.value.id,
        ...(item.value.description === undefined ? {} : { description: item.value.description }),
        ...(detail === undefined ? {} : { detail }),
        usage: whoUses(workspace, { kind, id: item.value.id, hub: item.hub }),
      };
    };
    const hubs = filesOf(workspace, "hub").map((hub) => ({
      id: hub.value.id,
      name: hub.value.name,
      entries: items.filter((item) => item.hub === hub.value.id).map(entryOf),
    }));
    const shared = items.filter((item) => item.hub === null).map(entryOf);
    return {
      hubs,
      ...(shared.length === 0
        ? {}
        : { shared: { workspaceName: nameOf(workspace), entries: shared } }),
    };
  }

  /**
   * Deletes the item's file (a skill's whole folder) as one change. Undo is the workspace's undo,
   * so it puts the item back only while the delete is still the newest step: after any other
   * change, or after the delete was undone some other way, it rejects and undoes nothing.
   */
  async remove(kind: LibraryItemKind, place: LibraryItemPlace): Promise<RemovedLibraryItem> {
    const files = this.#parts.files;
    const name = displayName(kind, place.id);
    const paths = await itemPaths(files, kind, place);
    if (paths.length === 0)
      throw new KindedError("not_found", `${name} isn't in this workspace any more.`);
    files.change(
      `Deleted ${kind} ${place.id}`,
      Object.fromEntries(paths.map((path) => [path, null])),
    );
    const afterDelete = files.step;
    return {
      undo: async () => {
        if (files.step !== afterDelete || !files.undo()) {
          throw new KindedError(
            "conflict",
            `${name} can't be put back, because the workspace changed after it was deleted.`,
          );
        }
      },
    };
  }

  subscribe(listener: () => void): () => void {
    return this.#parts.onChange(listener);
  }

  /** The workspace as files, with unsaved changes applied. */
  #source(): DefinitionSource {
    return unsavedSource(this.#parts.files);
  }
}

/** The workspace's files, with the unsaved changes the kernel's `WorkspaceFiles` applies, as a source to load. */
export function unsavedSource(files: WorkspaceLibraryItemsParts["files"]): DefinitionSource {
  return {
    location: "workspace:unsaved",
    list: async () => {
      const listed = await Promise.all(folders.map((folder) => files.list(folder)));
      const settings = (await files.read(settingsPath)) === null ? [] : [settingsPath];
      return [...settings, ...listed.flat()];
    },
    read: (path) => files.read(path),
    version: async () => "unsaved",
  };
}

function nameOf(workspace: LoadedWorkspace): string {
  return filesOf(workspace, "workspace")[0]?.value.name ?? "the workspace";
}

function displayName(kind: LibraryItemKind, id: string): string {
  return `The ${kind} ${id}`;
}

/** The files an item is made of that exist now: a skill's folder, or the one file of the others. */
async function itemPaths(
  files: WorkspaceLibraryItemsParts["files"],
  kind: LibraryItemKind,
  { hub, id }: LibraryItemPlace,
): Promise<string[]> {
  const root = hub === null ? "" : `hubs/${hub}/`;
  if (kind === "skill") return files.list(`${root}library/skills/${id}`);
  const path = {
    knowledge: `${root}library/knowledge/${id}.yaml`,
    collection: `${root}library/collections/${id}.collection.yaml`,
    connector: `${root}library/connectors/${id}.connector.yaml`,
  }[kind];
  return (await files.read(path)) === null ? [] : [path];
}
