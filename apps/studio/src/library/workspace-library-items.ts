import { type LibraryItemKind, whoUses } from "@halonicjs/app";
import type { DefinitionSource } from "@halonicjs/ports";
import type {
  LibraryEntry,
  LibraryItemsHost,
  LibraryListing,
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
  readonly #parts: WorkspaceLibraryItemsParts;

  constructor(parts: WorkspaceLibraryItemsParts) {
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

  subscribe(listener: () => void): () => void {
    return this.#parts.onChange(listener);
  }

  /** The workspace as files, with unsaved changes applied. */
  #source(): DefinitionSource {
    const { files } = this.#parts;
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
}

function nameOf(workspace: LoadedWorkspace): string {
  return filesOf(workspace, "workspace")[0]?.value.name ?? "the workspace";
}
