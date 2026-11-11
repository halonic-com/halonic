import type { RunSummary } from "@halonicjs/events";
import type { RunExecutor } from "@halonicjs/ports";
import type { PlaceSignal } from "@halonicjs/studio-shell";
import { type InboxDecisions, inboxDecisions } from "./decide.ts";
import { inboxSignal } from "./inbox-count.ts";
import { type InboxItem, inboxItems } from "./inbox-items.ts";

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

/** What the Inbox holds now. */
export interface InboxState {
  /** What waits for you, newest first: the last list that loaded, or none before the first. */
  readonly items: readonly InboxItem[];
  /** Whether a list has loaded once, so "nothing waiting" can be told from "not loaded yet". */
  readonly loaded: boolean;
  /** Why the last load failed, until one succeeds; the items stay as they were. */
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
 * await inbox.decisions.approve(inbox.state.items[0]);
 */
export class Inbox {
  readonly decisions: InboxDecisions;
  #state: InboxState = { items: [], loaded: false, error: undefined };
  readonly #runs: InboxRuns;
  readonly #listeners = new Set<() => void>();
  readonly #stopWatching: () => void;
  /**
   * The items you have answered, by key and waiting time; they stay out until a load no longer
   * lists them. The time tells a step the run came back to from the one you answered.
   */
  readonly #answered = new Set<string>();
  #loads = 0;
  #disposed = false;

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
   * Loads the waiting runs again. When loads overlap, only the last one
   * started counts, so an older answer never overwrites a newer one. Once
   * the workspace has closed it does nothing, and a load still on its way is
   * dropped.
   */
  async refresh(): Promise<void> {
    if (this.#disposed) return;
    const load = ++this.#loads;
    try {
      const runs = await this.#runs.waiting();
      if (load !== this.#loads || this.#disposed) return;
      const items = inboxItems(runs);
      const listed = new Set(items.map(answerId));
      for (const id of this.#answered) if (!listed.has(id)) this.#answered.delete(id);
      this.#set({
        items: items.filter((item) => !this.#answered.has(answerId(item))),
        loaded: true,
        error: undefined,
      });
    } catch (error) {
      if (load !== this.#loads || this.#disposed) return;
      this.#set({ ...this.#state, error });
    }
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
    this.#listeners.clear();
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
    const settle = async (item: InboxItem, sent: Promise<RunSummary>) => {
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

function answerId(item: InboxItem): string {
  return `${item.key}@${item.since}`;
}
