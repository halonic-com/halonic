import { type LibraryItemKind, type Reference, referencesTo } from "@halonicjs/app";
import {
  checkWorkspacePath,
  type DefinitionWatch,
  isPrivateWorkspacePath,
  type WorkspaceFileChange,
} from "@halonicjs/ports";
import {
  type CompareChoice,
  type FileCompare,
  type FileIssue,
  FilePathError,
  type FilesHost,
  type FilesListing,
  filesWords,
  type OutsideChange,
  type RemovedFile,
  type RenamedFile,
  type RenameImpact,
} from "@halonicjs/studio-feature-files/api";
import { loadWorkspace, placeOf } from "@halonicjs/workspace";
import { editYaml, readYaml } from "@halonicjs/yaml";
import { unsavedSource } from "../library/workspace-library-items.ts";

/** What {@link WorkspaceFilesHost} needs of the workspace's files and events. */
export interface FilesHostParts {
  /** The folder's saved files, from its root, recursively. Local data and private entries are already left out. */
  readonly store: {
    list(): Promise<string[]>;
    /** Reports the files that changed outside Halonic; Halonic's own writes are left out. */
    watch?(listener: {
      changed(changes: readonly WorkspaceFileChange[]): void;
      failed(error: Error): void;
    }): Promise<DefinitionWatch>;
  };
  /** The kernel's `WorkspaceFiles`: its unsaved changes by path, `null` for an unsaved delete. */
  readonly files: {
    readonly pending: Readonly<Record<string, string | null>>;
    /** The kernel's `WorkspaceFiles.step`: moves on every change to the undo steps, not on a save, so it tells a step is still the newest. */
    readonly step: number;
    read(path: string): Promise<string | null>;
    list(dir: string): Promise<string[]>;
    change(
      label: string,
      changes: Record<string, string | null>,
      options?: { coalesceKey?: string },
    ): void;
    /** Takes in outside changes of files with no unsaved changes as one undo step; the rest come back as `held`. */
    reloadFromOutside(
      paths: readonly string[],
    ): Promise<{ reloaded: readonly { path: string }[]; held: string[] }>;
    /** Moves a file as one undo step; `rewrites` is the new text of the files that name it. Rejects with an `Error` when it can't. */
    rename(from: string, to: string, rewrites?: Record<string, string>): Promise<void>;
    /** Takes back the newest undo step; `false` when there is none. */
    undo(): boolean;
    compare(path: string): Promise<FileCompare>;
    settle(path: string, choice: CompareChoice): Promise<unknown>;
  };
  /** Calls `listener` after every change of the workspace's files and every save; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
}

const libraryKinds: ReadonlySet<string> = new Set([
  "skill",
  "knowledge",
  "collection",
  "connector",
]);

/**
 * The Files feature's view of the workspace (`studio.workspace-files-host`): saved and unsaved
 * files together, and when they change.
 *
 * @example
 * services.provide(FilesHostService, new WorkspaceFilesHost({ store, files, onChange }));
 */
export class WorkspaceFilesHost implements FilesHost {
  readonly #parts: FilesHostParts;
  readonly #outside = new Map<string, OutsideChange>();
  readonly #listeners = new Set<() => void>();
  readonly #reloadListeners = new Set<(paths: readonly string[]) => void>();
  #watch: Promise<DefinitionWatch | undefined> | undefined;
  #disposed = false;

  constructor(parts: FilesHostParts) {
    this.#parts = parts;
    this.#watch = parts.store
      .watch?.({
        changed: (changes) => void this.#took(changes),
        // Without a watch only a save that finds the file changed shows it.
        failed: () => undefined,
      })
      .catch(() => undefined);
  }

  outside(): ReadonlyMap<string, OutsideChange> {
    return this.#outside;
  }

  compare(path: string): Promise<FileCompare> {
    return this.#parts.files.compare(path);
  }

  async settle(path: string, choice: CompareChoice): Promise<void> {
    await this.#parts.files.settle(path, choice);
    this.#outside.delete(path);
    this.#tell();
  }

  /** Closes the watch. Disposing twice is fine. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#listeners.clear();
    this.#reloadListeners.clear();
    const watch = this.#watch;
    this.#watch = undefined;
    await (await watch)?.close();
  }

  noteHeld(held: readonly { readonly path: string; readonly current: string | null }[]): void {
    for (const { path, current } of held) {
      this.#outside.set(path, current === null ? "deleted" : "changed");
    }
    this.#tell();
  }

  onReloaded(listener: (paths: readonly string[]) => void): () => void {
    this.#reloadListeners.add(listener);
    return () => this.#reloadListeners.delete(listener);
  }

  /** Takes in one batch of outside changes: files without unsaved changes are reloaded, the others are held. */
  async #took(changes: readonly WorkspaceFileChange[]): Promise<void> {
    let reloaded: readonly { path: string }[];
    try {
      const taken = await this.#parts.files.reloadFromOutside(changes.map(({ path }) => path));
      reloaded = taken.reloaded;
      for (const path of taken.held) {
        const { theirs } = await this.#parts.files.compare(path);
        this.#outside.set(path, theirs === null ? "deleted" : "changed");
      }
    } catch {
      // The next change, or a save that finds the file changed, shows it.
      return;
    }
    this.#tell();
    if (reloaded.length > 0 && !this.#disposed) {
      const paths = reloaded.map(({ path }) => path);
      for (const listener of this.#reloadListeners) listener(paths);
    }
  }

  #tell(): void {
    if (this.#disposed) return;
    for (const listener of this.#listeners) listener();
  }

  async list(): Promise<FilesListing> {
    let saved: string[];
    try {
      saved = await this.#parts.store.list();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(reason.endsWith(".") ? reason : `${reason}.`);
    }
    const paths = new Set(saved);
    for (const [path, text] of Object.entries(this.#parts.files.pending)) {
      if (text === null) paths.delete(path);
      else paths.add(path);
    }
    const marks = await this.#marks();
    return { paths: [...paths].sort(), marks };
  }

  /** The problems and outside changes by file. */
  async #marks(): Promise<Map<string, { errors: number; warnings: number; outside: boolean }>> {
    // A file that has no unsaved changes any more (undone) is no longer waiting for Compare.
    for (const path of this.#outside.keys()) {
      if (!Object.hasOwn(this.#parts.files.pending, path)) this.#outside.delete(path);
    }
    const marks = new Map<string, { errors: number; warnings: number; outside: boolean }>();
    const markOf = (path: string) => {
      const mark = marks.get(path) ?? { errors: 0, warnings: 0, outside: false };
      marks.set(path, mark);
      return mark;
    };
    for (const issue of await this.problems()) {
      markOf(issue.file)[issue.severity === "error" ? "errors" : "warnings"] += 1;
    }
    for (const path of this.#outside.keys()) markOf(path).outside = true;
    return marks;
  }

  async problems(): Promise<readonly FileIssue[]> {
    try {
      const workspace = await loadWorkspace(unsavedSource(this.#parts.files));
      return workspace.issues
        .map(({ file, severity, message, line, col }) => ({ file, severity, message, line, col }))
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);
    } catch {
      return [];
    }
  }

  read(path: string): Promise<string | null> {
    return this.#parts.files.read(path);
  }

  async create(path: string): Promise<void> {
    await this.#checkFreePath(path);
    this.#parts.files.change(`New file ${path}`, { [path]: "" });
  }

  /** Throws a one-sentence reason unless `path` is a path the workspace serves that has no file or folder yet. */
  async #checkFreePath(path: string): Promise<void> {
    try {
      checkWorkspacePath(path);
    } catch {
      throw new FilePathError(filesWords.pathOutside);
    }
    if (isPrivateWorkspacePath(path)) {
      throw new FilePathError(filesWords.pathPrivate(path));
    }
    const { files } = this.#parts;
    const segments = path.split("/");
    for (let end = 1; end < segments.length; end++) {
      const prefix = segments.slice(0, end).join("/");
      if ((await files.read(prefix)) !== null) throw new FilePathError(filesWords.pathFile(prefix));
    }
    if ((await files.list(path)).length > 0) throw new FilePathError(filesWords.pathFolder(path));
    if ((await files.read(path)) !== null) throw new FilePathError(filesWords.pathTaken(path));
  }

  async renameImpact(from: string, to: string): Promise<RenameImpact> {
    const { places, owners } = await this.#renamePlan(from, to);
    return { places, owners };
  }

  async rename(from: string, to: string): Promise<RenamedFile> {
    if (from === to) throw new Error(`${to} already has that name.`);
    await this.#checkFreePath(to);
    await this.#refuseSkillSplit(from, to);
    const { rewrites, places, owners } = await this.#renamePlan(from, to);
    const files = this.#parts.files;
    await files.rename(from, to, rewrites);
    const afterRename = files.step;
    return {
      places,
      owners,
      undo: async () => {
        if (files.step !== afterRename || !files.undo()) {
          throw new Error(
            `${to} can't be moved back, because the workspace changed after it was renamed.`,
          );
        }
      },
    };
  }

  async remove(path: string): Promise<RemovedFile> {
    const files = this.#parts.files;
    if ((await files.read(path)) === null) throw new Error(`${path} isn't here any more.`);
    await this.#refuseSkillSplit(path, undefined);
    const old = placeOf(path);
    const places =
      old?.placeId === undefined || !libraryKinds.has(old.kind)
        ? []
        : ((await this.#placesNaming(path, old.kind as LibraryItemKind, old.hub, old.placeId)) ??
          []);
    files.change(`Deleted ${path}`, { [path]: null });
    const afterDelete = files.step;
    return {
      places: places.length,
      undo: async () => {
        if (files.step !== afterDelete || !files.undo()) {
          throw new Error(
            `${path} can't be put back, because the workspace changed after it was deleted.`,
          );
        }
      },
    };
  }

  /** A skill is its whole folder: moving only `SKILL.md` to another folder would leave the rest behind. */
  async #refuseSkillSplit(from: string, to: string | undefined): Promise<void> {
    const folder = from.slice(0, from.lastIndexOf("/"));
    if (
      placeOf(from)?.kind !== "skill" ||
      (to !== undefined && folder === to.slice(0, to.lastIndexOf("/")))
    ) {
      return;
    }
    const others = (await this.#parts.files.list(folder)).filter((path) => path !== from);
    if (others.length > 0) {
      const verb = to === undefined ? "deleted" : "renamed";
      throw new Error(`This skill has other files in its folder, so it can't be ${verb} here yet.`);
    }
  }

  /**
   * What a rename does to other files. A Library item's id is the `<id>` of its file name, so
   * a new name is a new id, and every place that names the old one gets the new one. A file
   * with an `id:` of its own keeps it over its name: it gets the new id too, and a file whose
   * `id:` isn't its name keeps its id. A move that keeps the id, or a file that isn't a
   * Library item, changes nothing else.
   */
  async #renamePlan(
    from: string,
    to: string,
  ): Promise<{ rewrites: Record<string, string>; places: number; owners: string[] }> {
    const none = { rewrites: {}, places: 0, owners: [] };
    const old = placeOf(from);
    const next = placeOf(to);
    if (old?.placeId === undefined || next?.placeId === undefined) return none;
    if (old.kind !== next.kind || old.hub !== next.hub || old.placeId === next.placeId) return none;
    if (!libraryKinds.has(old.kind)) return none;
    const kind = old.kind as LibraryItemKind;
    const places = await this.#placesNaming(from, kind, old.hub, old.placeId);
    if (places === undefined) return none;
    const rewrites: Record<string, string> = {};
    const own = await this.#withNewOwnId(from, kind, next.placeId);
    if (own !== undefined) rewrites[from] = own;
    for (const place of places) {
      const text = rewrites[place.file] ?? (await this.#parts.files.read(place.file));
      if (text === null) continue;
      const edited = editYaml(text, [{ kind: "set", path: place.path, value: next.placeId }]);
      if (!edited.ok) throw new Error(`Couldn't update ${place.file}.`);
      rewrites[place.file] = edited.value.text;
    }
    return { rewrites, places: places.length, owners: [...new Set(places.map((p) => p.owner))] };
  }

  /** The places that name the item in `from` by its id, or `undefined` when the rename gives it no new id. */
  async #placesNaming(
    from: string,
    kind: LibraryItemKind,
    hub: string | null,
    placeId: string,
  ): Promise<Reference[] | undefined> {
    try {
      const workspace = await loadWorkspace(unsavedSource(this.#parts.files));
      const loaded = workspace.files.find((file) => file.path === from);
      // A file that didn't parse names nothing yet, so its name stands for its id.
      const id = loaded !== undefined && "id" in loaded.value ? loaded.value.id : placeId;
      if (id !== placeId) return undefined;
      return referencesTo(workspace, { kind, id, hub: kind === "collection" ? null : hub });
    } catch {
      return undefined;
    }
  }

  /** The file's text with its own `id:` set to `id`, or `undefined` when it has none (a skill never has). */
  async #withNewOwnId(path: string, kind: string, id: string): Promise<string | undefined> {
    if (kind === "skill") return undefined;
    const text = await this.#parts.files.read(path);
    if (text === null) return undefined;
    const read = readYaml(text);
    if (!read.ok) return undefined;
    const data = read.value.data;
    if (typeof data !== "object" || data === null || !Object.hasOwn(data, "id")) return undefined;
    const edited = editYaml(text, [{ kind: "set", path: ["id"], value: id }]);
    if (!edited.ok) throw new Error(`Couldn't update ${path}.`);
    return edited.value.text;
  }

  edit(path: string, text: string): void {
    this.#parts.files.change(`Edited ${path}`, { [path]: text }, { coalesceKey: path });
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    const stop = this.#parts.onChange(listener);
    return () => {
      this.#listeners.delete(listener);
      stop();
    };
  }
}
