import type { ItemRef, OpenItemOptions, ViewRef } from "@halonicjs/studio-shell";
import type { AfterAnswer } from "./decide.ts";
import type { WaitItem } from "./inbox-items.ts";

/**
 * A view that takes a wait card's place once your answer is recorded, such as first-run's "You
 * did it" after the first run's Approve. A feature adds it to each workspace's Inbox
 * (`Inbox.addAnsweredView`); the Inbox knows nothing about the feature. An answer no view claims
 * keeps the card's decided bar.
 */
export interface InboxAnsweredView {
  /**
   * Whether this view takes the card's place: `event` is the answer you gave, such as `approve`,
   * and `after` what the run did with it. Called once, as the answer comes back.
   */
  claims(item: WaitItem, event: string, after: AfterAnswer): boolean;
  /**
   * The view, loaded only once it claims an answer. Its module exports a component that takes
   * {@link AnsweredViewProps} and moves focus to its title as it mounts. While it loads, and if it
   * can't load, the card stays with its decided bar.
   */
  readonly view: ViewRef;
}

/** What an answered view gets from the card it replaces. */
export interface AnsweredViewProps {
  /** The item you answered. It has left the Inbox's list by now. */
  readonly item: WaitItem;
  /** Closes the view and leaves the pane empty, as **Not now** does for an item. */
  readonly close: () => void;
  /**
   * Opens an item's page, such as Support reply, or a part of it (`step`), such as its Run form;
   * left out where the page can't open one.
   */
  readonly openItem?: ((item: ItemRef, options?: OpenItemOptions) => void) | undefined;
}
