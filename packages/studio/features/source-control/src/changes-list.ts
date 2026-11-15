import type { PlaceSignal, ServiceKey } from "@halonicjs/studio-shell";
import { serviceKey } from "@halonicjs/studio-shell";
import type { ChangesRead, ChangesSource } from "./api.ts";
import { pageWords } from "./changes-words.ts";

/** What the Changes list holds now. */
export interface ChangesListState {
  /** The last read that worked; `undefined` before the first one. */
  readonly read: ChangesRead | undefined;
  /** Why the last read failed, until one works; `read` stays as it was. */
  readonly error: unknown;
  /** Why Turn on history failed, until the next try. */
  readonly turnOnError: unknown;
  /** Whether Turn on history is working. */
  readonly turningOn: boolean;
}

/**
 * The changes of one open workspace, kept current from its `ChangesSource`. The sidebar's count
 * and the Changes page read this one service, so they change together. A read only swaps the
 * answer: the page never shows a skeleton again once it has one (states D1).
 *
 * @example
 * const list = new ChangesList(source);
 * list.subscribe(() => render(list.state.read));
 */
export class ChangesList {
  readonly source: ChangesSource;
  #state: ChangesListState = {
    read: undefined,
    error: undefined,
    turnOnError: undefined,
    turningOn: false,
  };
  readonly #listeners = new Set<() => void>();
  readonly #stopWatching: () => void;
  #reads = 0;
  #disposed = false;

  constructor(source: ChangesSource) {
    this.source = source;
    this.#stopWatching = source.subscribe(() => void this.refresh());
    void this.refresh();
  }

  get state(): ChangesListState {
    return this.#state;
  }

  /** How many files changed since the last version; zero when nothing did or there is no history. */
  get changedFileCount(): number {
    const read = this.#state.read;
    return read?.kind === "ready" ? read.changes.length : 0;
  }

  /** The sidebar's count, "Changes, 3 changes"; nothing at zero. */
  signal(): PlaceSignal | undefined {
    const count = this.changedFileCount;
    if (count === 0) return undefined;
    return { mark: "count", value: count, spoken: pageWords.spokenCount(count) };
  }

  /**
   * Reads the changes again. When reads overlap, only the last one started counts, so an older
   * answer never overwrites a newer one. Once the workspace has closed it does nothing.
   */
  async refresh(): Promise<void> {
    if (this.#disposed) return;
    const read = ++this.#reads;
    try {
      const answer = await this.source.read();
      if (read !== this.#reads || this.#disposed) return;
      this.#set({ ...this.#state, read: answer, error: undefined });
    } catch (error) {
      if (read !== this.#reads || this.#disposed) return;
      this.#set({ ...this.#state, error });
    }
  }

  /** Turns history on, then reads again. A failure stays in `turnOnError` for the page to say. */
  async turnOnHistory(): Promise<void> {
    if (this.#disposed || this.#state.turningOn) return;
    this.#set({ ...this.#state, turningOn: true, turnOnError: undefined });
    try {
      await this.source.turnOnHistory();
    } catch (error) {
      if (!this.#disposed) this.#set({ ...this.#state, turningOn: false, turnOnError: error });
      return;
    }
    if (this.#disposed) return;
    this.#set({ ...this.#state, turningOn: false });
    await this.refresh();
  }

  /** Calls `listener` after every change of {@link state}. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stops watching, when the workspace closes and its services are disposed. */
  dispose(): void {
    this.#disposed = true;
    this.#stopWatching();
    this.#listeners.clear();
  }

  #set(state: ChangesListState): void {
    this.#state = state;
    for (const listener of [...this.#listeners]) listener();
  }
}

/** The open workspace's {@link ChangesList}; the feature provides it from `ChangesSourceService`. */
export const ChangesListService: ServiceKey<ChangesList> =
  serviceKey<ChangesList>("source-control.list");
