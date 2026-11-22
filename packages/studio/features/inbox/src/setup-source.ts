import type { EngineWords, ItemRef, ViewRef } from "@halonicjs/studio-shell";
import type { SetupItem } from "./inbox-items.ts";

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
 * (`Inbox.addSetupSource`); the Inbox knows nothing about the provider.
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
  /**
   * Opens an item's page, such as the first run's **Continue** opening Support reply
   * (`inbox.setup-item-open`); left out where the page can't open one.
   */
  readonly openItem?: ((item: ItemRef) => void) | undefined;
  /** Says a line to a screen reader, for the answer to a press; left out where nothing listens. */
  readonly announce?: ((line: string) => void) | undefined;
}
