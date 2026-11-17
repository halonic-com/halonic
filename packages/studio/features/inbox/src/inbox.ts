import type { RunSummary } from "@halonicjs/events";
import type { RunExecutor } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { EngineWords, PlaceSignal, ViewRef } from "@halonicjs/studio-shell";
import { type InboxDecisions, inboxDecisions, wasDecidedElsewhere } from "./decide.ts";
import { inboxSignal } from "./inbox-count.ts";
import {
  type InboxItem,
  inboxItems,
  needsYouOrder,
  type RunItem,
  type SetupItem,
  setupKey,
} from "./inbox-items.ts";
import type { InboxNotices } from "./notices/inbox-notices.ts";

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
  /**
   * An agent's name as its file says; `undefined` when the workspace has no such agent or can't
   * be read, and the Inbox then shows the id.
   */
  agentName?(agentId: string): string | undefined;
  /** Sends an answer to a run; see `RunExecutor.send`. */
  send: RunExecutor["send"];
}

/**
 * How long an answer may take before the Inbox gives up on it, so a hanging engine ends in an
 * error on the card and not in a spinner that never stops.
 */
export const answerTimeoutMs = 30_000;

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
  /** The account still needs a secret from you: a first one, or a new one for a refused one. */
  readonly needsSecret?: boolean;
  /**
   * The setup is done, but the entry stays in the list until you pick another row or leave (the
   * source's {@link InboxSetupSource.release}). It says "Fixed", and it isn't counted.
   */
  readonly fixed?: boolean;
}

/** What to put the cursor on when a setup item opens: the field for the secret. */
export type SetupFocus = "secret";

/**
 * The accounts one provider has to set up or fix, such as the Google accounts whose setup isn't
 * done. A provider's feature adds its source to each workspace's Inbox
 * ({@link Inbox.addSetupSource}); the Inbox knows nothing about the provider.
 */
export interface InboxSetupSource {
  /** The provider's id, such as `google`. Item keys start with it. */
  readonly provider: string;
  /** The provider's name as you read it, such as "Google": "Loading the Google setup". */
  readonly name: string;
  /**
   * The view of one item at its current step, loaded only when an item opens. Its module exports
   * a component that takes {@link SetupViewProps} and moves focus to the current step's title as
   * it mounts. Without it, the Inbox shows the item's title and progress line.
   */
  readonly view?: ViewRef;
  /** Every account that needs you now, one entry each. */
  list(): Promise<readonly SetupEntry[]>;
  /** Calls `listener` whenever an entry may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
  /**
   * Called once a `fixed` entry's item is no longer open: you picked another row or left the
   * Inbox. The source stops listing the entry and tells its listeners.
   */
  release?(account: string): void;
}

/** What a setup source's view gets from the Inbox's pane. */
export interface SetupViewProps {
  /** The open item, the latest the source listed. It stays once the setup is done. */
  readonly item: SetupItem;
  /**
   * Whether the engine answers. While it doesn't, the view shows what it has, keeps its copy
   * buttons and links working, and marks the buttons that act with `aria-disabled`.
   */
  readonly answering: boolean;
  /** The engine words for this window's host (the desktop app's when left out), for the reason beside a control that can't act. */
  readonly words?: EngineWords;
  /** **Not now**: closes the item and puts focus back on its row. */
  readonly close: () => void;
  /**
   * What the item was opened to reach, such as the secret field. The view opens the step that has
   * it and puts focus there instead of on the step's title; without it, the current step opens.
   */
  readonly focus?: SetupFocus | undefined;
  /** Opens a run's page, for a view that lists runs; left out where the page can't open one. */
  readonly openRun?: ((hubId: string, runId: string) => void) | undefined;
  /** Says a line to a screen reader, for the answer to a press; left out where nothing listens. */
  readonly announce?: ((line: string) => void) | undefined;
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
  /**
   * Notices a setup source leaves behind once its item is dealt with (the sandbox's "fixed"
   * notice); the Notices section shows them with the app's. Set where the sources are added.
   */
  extraNotices: InboxNotices | undefined;
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
  #toFocus: SetupFocus | undefined;
  #newRequestAsked = false;
  #newRequestText: string | undefined;
  /** Notes set aside by item key while their writer goes elsewhere. They are in memory only. */
  readonly #setAside = new Map<string, string>();

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
    const items = inboxItems(runs.value, (id) => this.#runs.agentName?.(id) ?? id);
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
  requestOpen(key: string, focus?: SetupFocus): void {
    this.#toOpen = key;
    this.#toFocus = focus;
    for (const listener of [...this.#listeners]) listener();
  }

  /**
   * Asks the Inbox page to show the request form with focus in Message, as **New request** does,
   * such as the Try the sample card's first step. The page takes the request when it shows, or at
   * once if it's showing. With `message`, the form opens with it in Message, unless something is
   * typed there already.
   */
  requestNewRequest(message?: string): void {
    this.#newRequestAsked = true;
    this.#newRequestText = message;
    for (const listener of [...this.#listeners]) listener();
  }

  /** Whether the page was asked for the request form, once: the request is cleared as it's taken. */
  takeNewRequest(): boolean {
    const asked = this.#newRequestAsked;
    this.#newRequestAsked = false;
    return asked;
  }

  /** The message {@link requestNewRequest} came with, once. Call it right after {@link takeNewRequest}. */
  takeNewRequestText(): string | undefined {
    const text = this.#newRequestText;
    this.#newRequestText = undefined;
    return text;
  }

  /**
   * Asks the Inbox page to open an account's setup item, at its current step. The connector page,
   * the library's connector chip, the run banner and the routine chip call it, then open the Inbox
   * place, as Home's Needs you does with {@link requestOpen}.
   *
   * @example
   * inbox.openSetup("google", accountRef);
   * openPlace("inbox");
   *
   * @param focus What to reach in the item, such as `"secret"` for its secret field.
   */
  openSetup(provider: string, account: string, focus?: SetupFocus): void {
    this.requestOpen(setupKey(provider, account), focus);
  }

  /**
   * Keeps a note for an item while its writer is somewhere else, such as a note held for a secret
   * while the secret goes to its field. It stays in memory, is never saved, and leaves with
   * {@link takeAside}.
   */
  setAside(key: string, note: string): void {
    this.#setAside.set(key, note);
  }

  /** The note set aside for an item, left in place: for a render that reads it before {@link takeAside}. */
  peekAside(key: string): string | undefined {
    return this.#setAside.get(key);
  }

  /** The note set aside for an item, once: it is removed as it is taken. */
  takeAside(key: string): string | undefined {
    const note = this.#setAside.get(key);
    this.#setAside.delete(key);
    return note;
  }

  /** Lets a source drop a `fixed` item once it isn't open any more. */
  releaseSetup(item: SetupItem): void {
    if (item.fixed === true) this.setupSource(item.provider)?.release?.(item.account);
  }

  /** The setup source of a provider, for its name and its item's view. */
  setupSource(provider: string): InboxSetupSource | undefined {
    for (const source of this.#setupSources.keys()) if (source.provider === provider) return source;
    return undefined;
  }

  /** The item the page was asked to open, once: the request is cleared as it's taken. */
  takeOpenRequest(): InboxItem | undefined {
    const key = this.#toOpen;
    this.#toOpen = undefined;
    return key === undefined ? undefined : this.#state.items.find((item) => item.key === key);
  }

  /** What the request just taken asked to reach in its item, once. Call it right after {@link takeOpenRequest}. */
  takeOpenFocus(): SetupFocus | undefined {
    const focus = this.#toFocus;
    this.#toFocus = undefined;
    return focus;
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
    this.#setAside.clear();
    this.#listeners.clear();
  }

  #hasProvider(provider: string): boolean {
    return this.setupSource(provider) !== undefined;
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
      let summary: RunSummary;
      try {
        summary = await withTimeout(sent);
      } catch (error) {
        // The run may have moved on, or the answer may have gone through late: read the list again,
        // so the item leaves if nothing waits on it. A failed answer still leaves it in until then.
        if (wasDecidedElsewhere(error) || error instanceof AnswerTimedOut) void this.refresh();
        throw error;
      }
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
    needsSecret: entry.needsSecret === true,
    ...(entry.fixed === true ? { fixed: true } : {}),
  };
}

/** The answer didn't come back in time; the card shows it as a failed answer, with **Try again**. */
class AnswerTimedOut extends KindedError {
  constructor() {
    super(
      "unavailable",
      "The engine didn't answer in time. Your answer may not have been recorded.",
    );
  }
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AnswerTimedOut()), answerTimeoutMs);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
