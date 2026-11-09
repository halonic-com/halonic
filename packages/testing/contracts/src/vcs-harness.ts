import type { DefinitionStore, Vcs } from "@halonicjs/ports";
import type { DefinitionFiles } from "./definition-store.ts";

/**
 * One workspace folder under test: its version control, and its files as an
 * editor changes them. Writing through `files` changes the working tree, the
 * same way the Studio's editors do.
 */
export interface VcsHarness {
  vcs: Vcs;
  files: DefinitionStore;
}

/** Creates the folders the {@link Vcs} suite needs. Every folder is new and shares nothing with the others. */
export interface MakeVcs {
  /**
   * A folder holding `files` that is not a repository. Where the adapter
   * keeps runtime data, the folder also holds a file in `.studio`, which
   * `init` must ignore.
   */
  folder(files: DefinitionFiles): Promise<VcsHarness>;
  /**
   * A folder holding `files` inside a repository that is not the folder:
   * the repository's root is the folder's parent, and has `files` committed
   * in the folder. An adapter with no parent folders, such as the memory
   * one, gives a folder that is not a repository.
   */
  nested(files: DefinitionFiles): Promise<VcsHarness>;
  /** A repository on branch `main`, with `files` in one commit and no remote. */
  repo(files: DefinitionFiles): Promise<VcsHarness>;
  /**
   * Two clones of one new remote called `origin`. Each is on `main`, tracks
   * `origin/main` and has `files` in one commit, the same commit as the remote.
   */
  clones(files: DefinitionFiles): Promise<[VcsHarness, VcsHarness]>;
}

/** Branch names that look odd but git accepts; `createBranch` must not refuse them. */
export const validBranchNames: readonly string[] = [
  "feature/x-1",
  "fix_2",
  "release-1.2",
  "a.b",
  "user@host",
  "UPPER",
  "x-",
];
