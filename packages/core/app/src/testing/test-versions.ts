import type { Vcs, VcsCommit, VcsStatus } from "@halonicjs/ports";

/** The part of `Vcs` the live version and live state read. */
export type TestVersionsVcs = Pick<Vcs, "status" | "log" | "readAt">;

/**
 * A workspace's commits held in memory, for the kernel's own tests. A
 * deliberate fake: core may not use adapters, not even in tests. Each
 * commit gets a 40-character id and the date it is given; the last one is
 * HEAD. It doesn't check paths or ids: the code under test does.
 */
export class TestVersions implements TestVersionsVcs {
  readonly #commits: { readonly commit: VcsCommit; readonly files: Map<string, string> }[] = [];
  /** `false` makes it a folder that isn't a repository. */
  isRepo = true;

  /** Adds a commit holding exactly these files, as the new HEAD, and returns it. */
  commit(files: Readonly<Record<string, string>>, date = "2026-11-11T10:42:00Z"): VcsCommit {
    const hash = (this.#commits.length + 1).toString(16).padStart(40, "c");
    const commit = { hash, author: "acme", date, message: `Version ${this.#commits.length + 1}` };
    this.#commits.push({ commit, files: new Map(Object.entries(files)) });
    return commit;
  }

  async status(): Promise<VcsStatus> {
    return { isRepo: this.isRepo, branch: null, upstream: null, ahead: 0, behind: 0, changes: [] };
  }

  async log(limit: number): Promise<VcsCommit[]> {
    if (!this.isRepo) {
      throw new Error("Not a repository.");
    }
    return this.#commits
      .map((entry) => entry.commit)
      .reverse()
      .slice(0, limit);
  }

  async readAt(version: string, path: string): Promise<string | null> {
    const entry = this.#commits.find((candidate) => candidate.commit.hash === version);
    if (entry === undefined) {
      throw new Error(`Unknown version ${version}`);
    }
    return entry.files.get(path) ?? null;
  }
}
