import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RunCopies } from "@halonicjs/app";
import { checkRunId, type DefinitionStore, isRunId } from "@halonicjs/ports";
import { FolderDefinitionStore } from "./definition-store.ts";
import { isMissing, lstatOrNull } from "./links.ts";
import { makePrivateFolder } from "./private-files.ts";

/**
 * The copies of the workspace that runs with history off write in, as
 * folders in one folder of the user's profile: `<runId>/base`, left as the
 * workspace was at the start, and `<runId>/run`, where the run's agents
 * write. Each side is a {@link FolderDefinitionStore} of its own, so a run
 * can't reach the other side or another run's copy through a path or a link.
 *
 * The folder must never be inside the workspace: an agent that writes in
 * its `run` side must not be able to change what is kept as the workspace
 * was. Only the `run` side is the agent's to open; the folders above it are
 * private to the user.
 *
 * @example
 * const copies = new FolderRunCopies(folders.runCopiesFolder());
 * await copies.create(runId);
 * await copies.store(runId, "run").write("agents/coder.agent.yaml", text);
 */
export class FolderRunCopies implements RunCopies {
  readonly #root: string;

  /** @param root - the folder for the copies, such as `<workspace's folder in the profile>/run-copies`; created with the first copy */
  constructor(root: string) {
    this.#root = resolve(root);
  }

  /**
   * Makes the run's copy with both sides empty. A copy a stopped engine left
   * under this id goes first.
   *
   * @throws RangeError when `runId` isn't a run id
   */
  async create(runId: string): Promise<void> {
    await this.remove(runId);
    await makePrivateFolder(this.#copy(runId));
    await makePrivateFolder(this.#side(runId, "base"));
    await makePrivateFolder(this.#side(runId, "run"));
  }

  /**
   * One side of the run's copy.
   *
   * @throws RangeError when `runId` isn't a run id
   */
  store(runId: string, side: "base" | "run"): DefinitionStore {
    return new FolderDefinitionStore(this.#side(runId, side));
  }

  /** @throws RangeError when `runId` isn't a run id */
  folderOf(runId: string): string {
    return this.#side(runId, "run");
  }

  /** Removes both sides, links in them as links, not what they point to; nothing when the copy is gone. */
  async remove(runId: string): Promise<void> {
    await rm(this.#copy(runId), { recursive: true, force: true });
  }

  /** The runs that have a copy: the folders in the root named by a run id. */
  async list(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.#root);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const runIds: string[] = [];
    for (const name of names.filter(isRunId)) {
      if ((await lstatOrNull(join(this.#root, name)))?.isDirectory()) runIds.push(name);
    }
    return runIds.sort();
  }

  #copy(runId: string): string {
    checkRunId(runId);
    return join(this.#root, runId);
  }

  #side(runId: string, side: "base" | "run"): string {
    return join(this.#copy(runId), side);
  }
}
