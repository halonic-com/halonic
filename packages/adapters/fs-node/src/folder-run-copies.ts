import { mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DefinitionStore } from "@halonicjs/ports";
import { FolderDefinitionStore } from "./definition-store.ts";
import { isMissing } from "./links.ts";
import { makePrivateFolder } from "./private-files.ts";

/** The two sides of a run's copy: the workspace as it was at the start, and where the run writes. */
export type CopySide = "base" | "run";

/** What a run id may be to name a folder: letters, digits, `-` and `_`, as the engine's ids are. */
const folderRunId = /^[A-Za-z0-9_-]{1,64}$/u;

/**
 * The plain copies of the workspace that runs with history off work in
 * (`RunCopies` of `@halonicjs/app`), as folders of the user's profile: one
 * folder per run, with a `base` side left as the workspace was and a `run`
 * side where the run writes. Each side is read through a
 * {@link FolderDefinitionStore}, which refuses links, so a program that
 * writes in `run` can't make a read leave it.
 *
 * The root must sit in the profile, never in a workspace. A run id that
 * could name another folder never reaches a path.
 *
 * @example
 * const copies = new FolderRunCopies(folders.runCopiesFolder());
 * await copies.create(runId);
 * await copies.store(runId, "base").write("agents/writer.agent.yaml", text);
 * // the run's program works in copies.folderOf(runId)
 */
export class FolderRunCopies {
  readonly #root: string;

  /** @param root - the folder for the copies; created on the first `create` */
  constructor(root: string) {
    this.#root = resolve(root);
  }

  /**
   * Makes the run's copy with both sides empty. A copy left from an earlier
   * start of the same run is emptied first.
   *
   * @throws RangeError when `runId` isn't safe to name a folder
   */
  async create(runId: string): Promise<void> {
    const folder = this.#folderOf(runId);
    await makePrivateFolder(this.#root);
    await rm(folder, { recursive: true, force: true });
    await makePrivateFolder(folder);
    await mkdir(join(folder, "base"), { mode: 0o700 });
    await mkdir(join(folder, "run"), { mode: 0o700 });
  }

  /** One side of the run's copy, as a store of its own. */
  store(runId: string, side: CopySide): DefinitionStore {
    return new FolderDefinitionStore(join(this.#folderOf(runId), side));
  }

  /** The absolute folder of the run's `run` side: the only folder the run writes workspace files in. */
  folderOf(runId: string): string {
    return join(this.#folderOf(runId), "run");
  }

  /** Removes the run's copy, both sides; nothing when it is gone. */
  async remove(runId: string): Promise<void> {
    await rm(this.#folderOf(runId), { recursive: true, force: true });
  }

  /** The runs that have a copy, sorted. */
  async list(): Promise<string[]> {
    try {
      const entries = await readdir(this.#root, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && folderRunId.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  #folderOf(runId: string): string {
    if (!folderRunId.test(runId)) {
      throw new RangeError(`${JSON.stringify(runId)} can't name a run's copy.`);
    }
    return join(this.#root, runId);
  }
}
