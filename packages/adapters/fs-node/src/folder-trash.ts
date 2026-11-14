import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DefinitionStore, Digest, ExpectedContent, RemoveResult } from "@halonicjs/ports";
import { contentDigest, matchesExpected } from "@halonicjs/std";
import { writeFlushedFile } from "./flushed-write.ts";
import { isMissing } from "./links.ts";
import { makePrivateFolder, readUnlinkedFile } from "./private-files.ts";

/** What a trash entry's id looks like: the UUID the trash gave it, so no id can name another folder. */
const entryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** What the trash moved to an entry: the file's workspace path and its text. */
interface TrashedFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Halonic's own trash for the files of one workspace (`Trash` of
 * `@halonicjs/app`), in a folder of the user's profile, not the system's.
 * Each entry is one JSON file named by its id, holding the file's path and
 * text; the file leaves the workspace's store only after its entry is on
 * disk, so a crash between the two loses nothing.
 *
 * The folder must sit in the profile, never in a workspace.
 *
 * @example
 * const trash = new FolderTrash({ folder: trashFolder, store, digest });
 * const moved = await trash.moveToTrash("agents/old.agent.yaml", expected);
 * if (moved.status === "done") await trash.restore(moved.trashId);
 */
export class FolderTrash {
  readonly #folder: string;
  readonly #store: DefinitionStore;
  readonly #digest: Digest;

  /**
   * @param options.folder - the folder for the entries; created on the first move
   * @param options.store - the workspace's files, which the trash takes files out of and puts them back in
   * @param options.digest - hashes a file's text to compare it with what the caller expected
   */
  constructor(options: { folder: string; store: DefinitionStore; digest: Digest }) {
    this.#folder = resolve(options.folder);
    this.#store = options.store;
    this.#digest = options.digest;
  }

  /** Moves the file into the trash, if it still holds `expected`. */
  async moveToTrash(
    path: string,
    expected?: ExpectedContent,
  ): Promise<
    | { readonly status: "done"; readonly trashId: string }
    | { readonly status: "changed-on-disk"; readonly current: string | null }
  > {
    const current = await this.#store.read(path);
    if (
      current === null ||
      (expected !== undefined && !(await matchesExpected(current, expected, this.#digest)))
    ) {
      return { status: "changed-on-disk", current };
    }
    const trashId = crypto.randomUUID();
    await makePrivateFolder(this.#folder);
    const entry: TrashedFile = { path, content: current };
    await writeFlushedFile(this.#fileOf(trashId), JSON.stringify(entry), { mode: 0o600 });
    // Removes only the text that went into the entry, so an edit made since the read isn't deleted.
    let removed: RemoveResult;
    try {
      removed = await this.#store.remove(path, {
        expected: await contentDigest(current, this.#digest),
      });
    } catch (error) {
      await rm(this.#fileOf(trashId), { force: true });
      throw error;
    }
    if (removed.status === "changed-on-disk") {
      await rm(this.#fileOf(trashId), { force: true });
      return removed;
    }
    return { status: "done", trashId };
  }

  /**
   * Puts a file back where it was. `occupied`: something is at that path
   * now, and nothing was overwritten. `missing`: the trash no longer has
   * that entry, such as after it was put back once already.
   */
  async restore(
    trashId: string,
  ): Promise<
    | { readonly status: "done" }
    | { readonly status: "occupied"; readonly current: string }
    | { readonly status: "missing" }
  > {
    if (!entryId.test(trashId)) {
      return { status: "missing" };
    }
    const entry = await this.#read(trashId);
    if (entry === null) {
      return { status: "missing" };
    }
    // The write itself refuses to replace a file, so a file made since can't be overwritten.
    const written = await this.#store.write(entry.path, entry.content, { expected: "absent" });
    if (written.status === "changed-on-disk") {
      return { status: "occupied", current: written.current ?? "" };
    }
    await rm(this.#fileOf(trashId), { force: true });
    return { status: "done" };
  }

  async #read(trashId: string): Promise<TrashedFile | null> {
    let text: string;
    try {
      text = await readUnlinkedFile(this.#fileOf(trashId));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    const entry: unknown = JSON.parse(text);
    if (!isTrashedFile(entry)) {
      throw new Error(`The trash entry ${trashId} isn't a trashed file.`);
    }
    return entry;
  }

  #fileOf(trashId: string): string {
    return join(this.#folder, `${trashId}.json`);
  }
}

function isTrashedFile(value: unknown): value is TrashedFile {
  if (typeof value !== "object" || value === null) return false;
  const { path, content } = value as Record<string, unknown>;
  return typeof path === "string" && typeof content === "string";
}
