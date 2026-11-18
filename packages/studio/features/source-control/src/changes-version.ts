import type { VersionDialogOutcome } from "./api.ts";
import type { ChangedFile, ChangesListState, ListHost } from "./changes-list-state.ts";
import { versionWords } from "./changes-words.ts";
import { loadFailureReason } from "./load-failure.ts";
import { versionMessage, versionPaths } from "./version-name.ts";

/**
 * The steps of Create version: opening it from the Changes page or from another feature,
 * closing it, and recording the version. A feature that opened it through
 * `VersionDialogService` is owed one answer; at most one is owed at a time.
 */
export class VersionSteps {
  readonly #host: ListHost;
  /** Answers the feature that opened Create version, while one waits. */
  #answer: ((outcome: VersionDialogOutcome) => void) | undefined;

  constructor(host: ListHost) {
    this.#host = host;
  }

  /** Opens Create version on the Changes page for `paths`, or for every changed file without them. */
  start(paths: readonly string[] | undefined): void {
    this.#give("cancelled");
    this.#host.set({ ...this.#host.state(), version: { paths, opener: "page" } });
  }

  /**
   * Opens Create version for `paths` from another feature, over whatever page is open. Answers
   * once a version is made or the dialog closes; at once with `"cancelled"` when the folder has
   * no history. A Create version opened before it is answered `"cancelled"`.
   */
  open(paths: readonly string[]): Promise<VersionDialogOutcome> {
    const { read } = this.#host.state();
    if (this.#host.disposed() || (read !== undefined && read.kind !== "ready")) {
      return Promise.resolve("cancelled");
    }
    this.#give("cancelled");
    const answer = new Promise<VersionDialogOutcome>((resolve) => {
      this.#answer = resolve;
    });
    this.#host.set({ ...this.#host.state(), version: { paths, opener: "elsewhere" } });
    return answer;
  }

  /** Closes Create version without creating anything. */
  cancel(): void {
    this.#give("cancelled");
    const state = this.#host.state();
    if (state.version !== undefined) this.#host.set({ ...state, version: undefined });
  }

  /**
   * What Create version is after a read: as it was, or closed when the folder has no history,
   * since there is no version to make then.
   */
  afterRead(ready: boolean): ChangesListState["version"] {
    if (ready) return this.#host.state().version;
    this.#give("cancelled");
    return undefined;
  }

  /** The changed files Create version is open for; none while it is closed. */
  get files(): readonly ChangedFile[] {
    const { version, files } = this.#host.state();
    if (version?.paths === undefined) return version === undefined ? [] : files;
    const wanted = new Set(version.paths);
    return files.filter((file) => wanted.has(file.path));
  }

  /**
   * Records the open Create version as one version, then closes it and reads again. Only its
   * files go in, or only those of them in `only` when it is given; anything else stays a change.
   * Gives the reason it didn't work, or `undefined`.
   */
  async create(name: string, notes: string, only?: readonly string[]): Promise<string | undefined> {
    const { read } = this.#host.state();
    const left = only === undefined ? undefined : new Set(only);
    const files = this.files.filter((file) => left === undefined || left.has(file.path));
    if (read?.kind !== "ready" || files.length === 0) return versionWords.nothingToCreate;
    const chosen = new Set(files.map((file) => file.path));
    const paths = versionPaths(read.changes.filter((change) => chosen.has(change.path)));
    try {
      await this.#host.source.createVersion({ message: versionMessage(name, notes), paths });
    } catch (error) {
      return loadFailureReason(error);
    }
    this.#give("made");
    if (!this.#host.disposed()) this.#host.set({ ...this.#host.state(), version: undefined });
    await this.#host.refresh();
    return undefined;
  }

  /** Answers a feature still waiting, when the workspace closes. */
  dispose(): void {
    this.#give("cancelled");
  }

  /** Answers the feature that opened Create version, if one waits; nobody is answered twice. */
  #give(outcome: VersionDialogOutcome): void {
    const answer = this.#answer;
    this.#answer = undefined;
    answer?.(outcome);
  }
}
