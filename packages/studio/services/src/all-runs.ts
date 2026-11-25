// Every run the Runs app lists, from every source the caller hands in: a
// workspace's runs, a Paperclip team's runs, later more workspaces (Liam's
// decision on HAL-18748). The rows are the caller's own type, so the Runs
// feature keeps its words and this package never imports a feature.

/** A source's id and the name the list shows for it, such as "Acme Ops" or "Paperclip · Acme". */
export interface RunSourceName {
  readonly id: string;
  readonly name: string;
}

/** One place runs come from: a workspace or a Paperclip team. */
export interface RunSource<Row> extends RunSourceName {
  /** The source's runs now, in any order. */
  read(): Promise<readonly Row[]>;
}

/** What a list row needs for the merge: an id unique across sources and when it started. */
export interface MergedRun {
  readonly id: string;
  /** ISO 8601. */
  readonly startedAt: string;
}

/** One source's last read: its rows, and the error when this read failed. */
export interface SourceRead<Row> {
  readonly source: RunSourceName;
  /** On a failure, the rows of the source's last good read, or none. */
  readonly rows: readonly Row[];
  /** Why the read failed; absent when it worked. */
  readonly error?: unknown;
}

/** A source whose last read failed, and why. */
export interface RunSourceFailure {
  readonly source: RunSourceName;
  readonly error: unknown;
}

/** Every source's rows, newest first, and the sources that failed. */
export interface MergedRuns<Row> {
  readonly rows: readonly Row[];
  readonly failures: readonly RunSourceFailure[];
}

/** What {@link AllRuns} holds now. */
export interface AllRunsState<Row> extends MergedRuns<Row> {
  /** Whether every source has answered once, well or not. */
  readonly loaded: boolean;
  /** Why listing the sources failed, until it works again; the rows stay as they were. */
  readonly error: unknown;
}

/**
 * Merges the sources' reads into one list (requirement `services.all-runs`):
 * newest start first, a tie by id so the order never flickers. A failed
 * source keeps its last rows and is named in `failures`; it never empties
 * the others.
 *
 * @example
 * mergeRuns([{ source: acme, rows: [ran] }, { source: team, rows: [], error }]);
 * // { rows: [ran], failures: [{ source: team, error }] }
 */
export function mergeRuns<Row extends MergedRun>(
  reads: readonly SourceRead<Row>[],
): MergedRuns<Row> {
  const rows = reads.flatMap((read) => read.rows);
  rows.sort((left, right) => startOf(right) - startOf(left) || left.id.localeCompare(right.id));
  const failures = reads
    .filter((read) => "error" in read)
    .map((read) => ({ source: read.source, error: read.error }));
  return { rows, failures };
}

/** A start that isn't a time sorts last rather than breaking the order. */
function startOf(run: MergedRun): number {
  const time = Date.parse(run.startedAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/** How often {@link AllRuns} reads every source while someone watches it. */
export const allRunsPollMs = 30_000;

/**
 * The runs of every source, read together and kept current: read again
 * every 30 seconds while anyone subscribes, and on {@link AllRuns.refresh}.
 * It doesn't know where the sources come from: the caller's `sources` says,
 * on each read, so a workspace or team connected later joins the list.
 *
 * @example
 * const all = new AllRuns(async () => [workspaceSource, ...teamSources]);
 * const stop = all.subscribe(() => render(all.state.rows));
 */
export class AllRuns<Row extends MergedRun> {
  readonly #sources: () => Promise<readonly RunSource<Row>[]>;
  readonly #pollMs: number;
  readonly #listeners = new Set<() => void>();
  /** Each source's last good rows, by source id, which a failed read keeps showing. */
  readonly #lastRows = new Map<string, readonly Row[]>();
  #state: AllRunsState<Row> = { rows: [], failures: [], loaded: false, error: undefined };
  #reading: Promise<void> | undefined;
  #readAgain = false;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    sources: () => Promise<readonly RunSource<Row>[]>,
    options: { readonly pollMs?: number } = {},
  ) {
    this.#sources = sources;
    this.#pollMs = options.pollMs ?? allRunsPollMs;
  }

  get state(): AllRunsState<Row> {
    return this.#state;
  }

  /** Calls `listener` after each read; the first subscriber starts the reads, the last one stops them. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    if (this.#timer === undefined) {
      this.#timer = setInterval(() => void this.refresh(), this.#pollMs);
      void this.refresh();
    }
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#stop();
    };
  }

  /** Reads every source again; a call during a read reads once more after it. */
  refresh(): Promise<void> {
    if (this.#reading !== undefined) {
      this.#readAgain = true;
      return this.#reading;
    }
    this.#reading = this.#readUntilCurrent().finally(() => {
      this.#reading = undefined;
    });
    return this.#reading;
  }

  /** Stops the reads; the state stays as it is. */
  dispose(): void {
    this.#listeners.clear();
    this.#stop();
  }

  async #readUntilCurrent(): Promise<void> {
    do {
      this.#readAgain = false;
      await this.#readOnce();
    } while (this.#readAgain);
  }

  async #readOnce(): Promise<void> {
    let sources: readonly RunSource<Row>[];
    try {
      sources = await this.#sources();
    } catch (error) {
      this.#set({ ...this.#state, loaded: true, error });
      return;
    }
    const reads = await Promise.all(sources.map((source) => this.#read(source)));
    this.#set({ ...mergeRuns(reads), loaded: true, error: undefined });
  }

  async #read(source: RunSource<Row>): Promise<SourceRead<Row>> {
    const name = { id: source.id, name: source.name };
    try {
      const rows = await source.read();
      this.#lastRows.set(source.id, rows);
      return { source: name, rows };
    } catch (error) {
      return { source: name, rows: this.#lastRows.get(source.id) ?? [], error };
    }
  }

  #set(state: AllRunsState<Row>): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }

  #stop(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
