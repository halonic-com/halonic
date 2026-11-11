// The workspace's files as one version holds them (save model 2.2, HAL-3246):
// what Run, routines, triggers and calls from other agents read, so a saved
// change isn't live until it is in a version.

import {
  checkCommitId,
  checkPublicWorkspacePath,
  type DefinitionSource,
  type Vcs,
} from "@halonicjs/ports";

/** The part of {@link Vcs} a {@link VersionSource} reads through. */
export type VersionReader = Pick<Vcs, "readAt" | "listAt">;

/**
 * A {@link DefinitionSource} over one commit (requirement
 * `workspace.definition-source-at-version`). It reads and lists only
 * through `Vcs.readAt` and `Vcs.listAt` at that commit, never the files on
 * disk, so a file saved but not in the version reads as it was there, and
 * a file that isn't in the version isn't found.
 *
 * It refuses unsafe and private paths as the port says, before it asks the
 * {@link Vcs}. Its `version()` is the commit id, so a run that starts from
 * it records the commit.
 *
 * @example
 * const live = new VersionSource(vcs, head, "~/workspaces/acme");
 * const workspace = await loadWorkspace(live);
 * workspace.version; // the commit id at HEAD
 */
export class VersionSource implements DefinitionSource {
  readonly location: string;
  readonly #vcs: VersionReader;
  readonly #commit: string;

  /**
   * @param vcs - the workspace's version control
   * @param commit - the full id of the commit to read
   * @param location - where the workspace lives, as its saved store says
   * @throws RangeError for a commit that isn't a full commit id
   */
  constructor(vcs: VersionReader, commit: string, location: string) {
    checkCommitId(commit);
    this.#vcs = vcs;
    this.#commit = commit;
    this.location = location;
  }

  /** Every file under `dir` in the version, sorted; `[]` when it has none there. */
  async list(dir?: string): Promise<string[]> {
    if (dir !== undefined) {
      checkPublicWorkspacePath(dir);
    }
    return (await this.#vcs.listAt(this.#commit, dir)) ?? [];
  }

  /** The file's text in the version, or `null` when the version has no such file. */
  async read(path: string): Promise<string | null> {
    checkPublicWorkspacePath(path);
    return this.#vcs.readAt(this.#commit, path);
  }

  /** The commit id. */
  async version(): Promise<string> {
    return this.#commit;
  }
}
