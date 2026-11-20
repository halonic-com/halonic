import { newLibraryFile } from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import type {
  CollectionRef,
  LibraryItemPlace,
  NewCollectionDraft,
  NewCollectionHost,
} from "@halonicjs/studio-feature-library/api";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { unsavedSource } from "./workspace-library-items.ts";
import type { WorkspaceSkillsParts } from "./workspace-skills.ts";

/** The folder that holds the workspace's collections, which is also what an empty name shows. */
const collectionsFolder = "library/collections/";

/**
 * Makes collections for the New collection dialog (`studio.workspace-new-collection`). Core's
 * `newLibraryFile` makes the id, path and text (one required text field `name`); the file is
 * written as one change that shows in Changes and can be undone. Collections are always shared,
 * so the reference has no hub. The path is read from a snapshot of the workspace that `prepare`
 * and `create` load again.
 *
 * @example
 * services.provide(NewCollectionHostService, new WorkspaceNewCollection({ files, onChange }));
 */
export class WorkspaceNewCollection implements NewCollectionHost {
  readonly #parts: WorkspaceSkillsParts;
  #snapshot: LoadedWorkspace | undefined;

  /** Told the name of each collection made, so its tab can show it before the Library reads it again. */
  readonly #made: ((place: LibraryItemPlace, name: string) => void) | undefined;

  constructor(parts: WorkspaceSkillsParts, made?: (place: LibraryItemPlace, name: string) => void) {
    this.#parts = parts;
    this.#made = made;
  }

  async prepare(): Promise<void> {
    await this.#load();
  }

  file({ name }: NewCollectionDraft): string {
    const made =
      this.#snapshot === undefined
        ? undefined
        : newLibraryFile(this.#snapshot, { kind: "collection", name });
    return made?.ok ? made.value.path : collectionsFolder;
  }

  async create({ name }: NewCollectionDraft): Promise<CollectionRef> {
    const made = newLibraryFile(await this.#load(), { kind: "collection", name });
    if (!made.ok) throw new KindedError("invalid_input", "Give it a name.");
    const { id, path, text } = made.value;
    this.#parts.files.change(`Added collection ${id}`, { [path]: text });
    this.#made?.({ hub: null, id }, name.trim());
    return { hub: null, id };
  }

  async #load(): Promise<LoadedWorkspace> {
    this.#snapshot = await loadWorkspace(unsavedSource(this.#parts.files));
    return this.#snapshot;
  }
}
