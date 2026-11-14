import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Trash } from "@halonicjs/app";
import type { DefinitionStore, Digest, ExpectedContent } from "@halonicjs/ports";
import { matchesExpected } from "@halonicjs/std";
import { writeFlushedFile } from "./flushed-write.ts";
import { isMissing } from "./links.ts";
import { makePrivateFolder, readUnlinkedFile } from "./private-files.ts";
import { renameOver } from "./rename-over.ts";

/** What one trash entry file holds: where the file was, and its text. */
interface TrashEntry {
  readonly path: string;
  readonly content: string;
}

/** The ids this trash gives: `randomUUID`'s, which is all a file name in its folder may be. */
const trashIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Halonic's own trash as one folder of the user's profile: each file moved
 * out of the workspace becomes `<trashId>.json`, holding its path and text,
 * until it is put back. The folder must never be inside the workspace, so
 * an agent that writes there can't plant or change an entry.
 *
 * Moving a file in writes the entry before the file leaves the workspace,
 * so a failure in between leaves the file where it was. Putting one back
 * never overwrites: it writes only where nothing is.
 *
 * @example
 * const trash = new FolderTrash(workspaceStore, folders.trashFolder(), digest);
 * const moved = await trash.moveToTrash("agents/old.agent.yaml");
 * if (moved.status === "done") await trash.restore(moved.trashId);
 */
export class FolderTrash implements Trash {
  readonly #store: DefinitionStore;
  readonly #root: string;
  readonly #digest: Digest;

  /**
   * @param store - the workspace's files, which files are moved out of and put back in
   * @param root - the trash folder, such as `<workspace's folder in the profile>/trash`; created with the first entry
   * @param digest - checks `expected`
   */
  constructor(store: DefinitionStore, root: string, digest: Digest) {
    this.#store = store;
    this.#root = resolve(root);
    this.#digest = digest;
  }

  async moveToTrash(path: string, expected?: ExpectedContent) {
    const current = await this.#store.read(path);
    if (
      current === null ||
      (expected !== undefined && !(await matchesExpected(current, expected, this.#digest)))
    ) {
      return { status: "changed-on-disk", current } as const;
    }
    const trashId = randomUUID();
    await this.#write(trashId, { path, content: current });
    await this.#store.remove(path);
    return { status: "done", trashId } as const;
  }

  async restore(trashId: string) {
    const entry = await this.#read(trashId);
    if (entry === null) {
      return { status: "missing" } as const;
    }
    const written = await this.#store.write(entry.path, entry.content, { expected: "absent" });
    if (written.status === "changed-on-disk") {
      return { status: "occupied", current: written.current ?? "" } as const;
    }
    await rm(this.#file(trashId), { force: true });
    return { status: "done" } as const;
  }

  /** The entry, or `null` for an id this trash didn't give or one already put back. */
  async #read(trashId: string): Promise<TrashEntry | null> {
    if (!trashIdPattern.test(trashId)) return null;
    let text: string;
    try {
      text = await readUnlinkedFile(this.#file(trashId));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    return parseEntry(this.#file(trashId), text);
  }

  async #write(trashId: string, entry: TrashEntry): Promise<void> {
    const file = this.#file(trashId);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await makePrivateFolder(this.#root);
    try {
      await writeFlushedFile(temporary, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
      await renameOver(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  #file(trashId: string): string {
    return join(this.#root, `${trashId}.json`);
  }
}

function parseEntry(file: string, text: string): TrashEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`The trash entry ${JSON.stringify(file)} isn't JSON, so it can't be put back.`);
  }
  const entry = parsed as Partial<TrashEntry> | null;
  if (typeof entry?.path !== "string" || typeof entry.content !== "string") {
    throw new Error(
      `The trash entry ${JSON.stringify(file)} has no path and text, so it can't be put back.`,
    );
  }
  return { path: entry.path, content: entry.content };
}
