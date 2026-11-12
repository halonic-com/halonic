import type { RunSummary } from "@halonicjs/events";
import type { RunExecutor } from "@halonicjs/ports";
import type { PlaceSignal } from "@halonicjs/studio-shell";
import { type InboxDecisions, inboxDecisions } from "./decide.ts";
import { inboxSignal } from "./inbox-count.ts";
import {
  type InboxItem,
  inboxItems,
  needsYouOrder,
  type RunItem,
  type SetupItem,
  setupKey,
} from "./inbox-items.ts";

/**
 * The runs the Inbox reads and answers. The app provides them for the open
 * workspace, from the run history (`RunHistory.listRuns`) and the run
 * executor.
 */
export interface InboxRuns {
  /** Every real run that waits now; test runs (Try it) may be left in, the Inbox skips them. */
  waiting(): Promise<readonly RunSummary[]>;
  /**
   * Calls `listener` whenever a run may have started or stopped waiting,
   * here or on another device. Returns a function that stops the calls.
   */
  subscribe(listener: () => void): () => void;
  /** Sends an answer to a run; see `RunExecutor.send`. */
  send: RunExecutor["send"];
}

/** One account's setup, as a setup source gives it. The Inbox makes it a {@link SetupItem}. */
export interface SetupEntry {
  /** The source's own ref for the account, such as Google's account ref. Never an e-mail address. */
  readonly account: string;
  /** "Set up Google for x@example.com". */
  readonly title: string;
  /** "Step 4 of 7 · Scopes". */
  readonly progress: string;
  /** ISO time the setup last changed. */
  readonly changedAt: string;
}

/**
 * The accounts one provider has to set up or fix, such as the Google accounts whose setup isn't
 * done. A provider's feature adds its source to each workspace's Inbox
 * ({@link Inbox.addSetupSource}); the Inbox knows nothing about the provider.
 */
export interface InboxSetupSource {
  /** The provider's id, such as `google`. Item keys start with it. */
  readonly provider: string;
  /** Every account that needs you now, one entry each. */
  list(): Promise<readonly SetupEntry[]>;
  /** Calls `listener` whenever an entry may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** What the Inbox holds now. */
export interface InboxState {
  /**
   * What waits for you: setup items first, most recently changed first, then run items, newest
   * first. The last list that loaded, or none before the first.
   */
  readonly items: readonly InboxItem[];
  /** Whether a list has loaded once, so "nothing waiting" can be told from "not loaded yet". */
  readonly loaded: boolean;
  /**
   * Why the last load failed, until one succeeds. When the runs fail, the items stay as they
   * were; when a setup source fails, only its items do, and the rest still update.
   */
  readonly error: unknown;
}

/**
 * The Inbox of one open workspace: its items and count, kept current, and
 * your answers. The sidebar's count, Home's Needs you and the Inbox page all
 * read this one service, so they show the same items and change together
 * (requirement `inbox.live`).
 *
 * @example
 * const inbox = new Inbox(runs);
 * inbox.subscribe(() => render(inbox.state.items));
 * const [first] = inbox.state.items;
 * if (first !== undefined && isRunItem(first)) await inbox.decisions.approve(first);
 */
export class Inbox {
  readonly decisions: InboxDecisions;
  #state: InboxState = { items: [], loaded: false, error: undefined };
  readonly #runs: InboxRuns;
  readonly #listeners = new Set<() => void>();
  readonly #stopWatching: () => void;
  /** The setup sources, each with the function that stops watching it. */
  readonly #setupSources = new Map<InboxSetupSource, () => void>();
  /** Each setup source's items from its last load that succeeded, kept while it fails. */
  readonly #setupItems = new Map<InboxSetupSource, readonly SetupItem[]>();
  /**
   * The items you have answered, by key and waiting time; they stay out until a load no longer
   * lists them. The time tells a step the run came back to from the one you answered.
   */
  readonly #answered = new Set<string>();
  #loads = 0;
  #disposed = false;
  #toOpen: string | undefined;

  constructor(runs: InboxRuns) {
    this.#runs = runs;
    this.decisions = this.#answering(inboxDecisions(runs));
    this.#stopWatching = runs.subscribe(() => void this.refresh());
    void this.refresh();
  }

  get state(): InboxState {
    return this.#state;
  }

  /** The count for the sidebar, Home's Needs you and the phone's bar. */
  signal(): PlaceSignal {
    return inboxSignal(this.#state.items);
  }

  /**
   * Adds a provider's setup source: its accounts become setup items, and the Inbox loads again
   * whenever the source changes. Returns a function that takes the source out again. A provider
   * has one source: one added for a provider that already has one is not added, so no two items
   * share a key.
   *
   * @example
   * const remove = inbox.addSetupSource(googleSetups);
   */
  addSetupSource(source: InboxSetupSource): () => void {
    if (this.#disposed || this.#hasProvider(source.provider)) return () => {};
    this.#setupSources.set(
      source,
      source.subscribe(() => void this.refresh()),
    );
    void this.refresh();
    return () => {
      const stop = this.#setupSources.get(source);
      if (stop === undefined) return;
      stop();
      this.#setupSources.delete(source);
      this.#setupItems.delete(source);
      void this.refresh();
    };
  }

  /**
   * Loads the waiting runs and the setup sources again. Each source loads on its own: one that
   * fails keeps its last items and sets {@link InboxState.error}, while the runs and the other
   * sources still update, so a provider's broken setup never hides a run that waits. When loads
   * overlap, only the last one started counts, so an older answer never overwrites a newer one.
   * Once the workspace has closed it does nothing, and a load still on its way is dropped.
   */
  async refresh(): Promise<void> {
    if (this.#disposed) return;
    const load = ++this.#loads;
    const sources = [...this.#setupSources.keys()];
    const [[runs], lists] = await Promise.all([
      Promise.allSettled([this.#runs.waiting()]),
      Promise.allSettled(sources.map((source) => source.list())),
    ]);
    if (load !== this.#loads || this.#disposed) return;
    if (runs.status === "rejected") {
      this.#set({ ...this.#state, error: runs.reason });
      return;
    }
    let error: unknown;
    const setups = sources.flatMap((source, index) => {
      const list = lists[index];
      if (list?.status === "fulfilled") {
        const items = list.value.map((entry) => setupItem(source.provider, entry));
        this.#setupItems.set(source, items);
        return items;
      }
      error ??= list?.reason;
      return this.#setupItems.get(source) ?? [];
    });
    const items = inboxItems(runs.value);
    const listed = new Set(items.map(answerId));
    for (const id of this.#answered) if (!listed.has(id)) this.#answered.delete(id);
    this.#set({
      items: needsYouOrder(
        setups,
        items.filter((item) => !this.#answered.has(answerId(item))),
      ),
      loaded: true,
      error,
    });
  }

  /**
   * Asks the Inbox page to open the item with this key, as Home's Needs you does before it opens
   * the Inbox. The page takes the request when it shows, or at once if it's showing.
   */
  requestOpen(key: string): void {
    this.#toOpen = key;
    for (const listener of [...this.#listeners]) listener();
  }

  /** The item the page was asked to open, once: the request is cleared as it's taken. */
  takeOpenRequest(): InboxItem | undefined {
    const key = this.#toOpen;
    this.#toOpen = undefined;
    return key === undefined ? undefined : this.#state.items.find((item) => item.key === key);
  }

  /** Calls `listener` after every change of {@link state}. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Stops watching the runs, when the workspace closes. The workspace's
   * `ServiceRegistry` calls it as it disposes its services.
   */
  dispose(): void {
    this.#disposed = true;
    this.#stopWatching();
    for (const stop of this.#setupSources.values()) stop();
    this.#setupSources.clear();
    this.#setupItems.clear();
    this.#listeners.clear();
  }

  #hasProvider(provider: string): boolean {
    for (const source of this.#setupSources.keys()) if (source.provider === provider) return true;
    return false;
  }

  #set(state: InboxState): void {
    this.#state = state;
    for (const listener of [...this.#listeners]) listener();
  }

  /**
   * Your answers, which take their item out as soon as the run has them, so
   * the count drops before the next load. A failed answer leaves it in.
   */
  #answering(decisions: InboxDecisions): InboxDecisions {
    const settle = async (item: RunItem, sent: Promise<RunSummary>) => {
      const summary = await sent;
      this.#answered.add(answerId(item));
      this.#set({
        ...this.#state,
        items: this.#state.items.filter((shown) => shown.key !== item.key),
      });
      void this.refresh();
      return summary;
    };
    return {
      approve: (item) => settle(item, decisions.approve(item)),
      reject: (item) => settle(item, decisions.reject(item)),
      askForChanges: (item, note) => settle(item, decisions.askForChanges(item, note)),
      answer: (item, event) => settle(item, decisions.answer(item, event)),
    };
  }
}

function answerId(item: RunItem): string {
  return `${item.key}@${item.since}`;
}

function setupItem(provider: string, entry: SetupEntry): SetupItem {
  return {
    kind: "setup",
    key: setupKey(provider, entry.account),
    provider,
    account: entry.account,
    title: entry.title,
    progress: entry.progress,
    changedAt: entry.changedAt,
  };
}
