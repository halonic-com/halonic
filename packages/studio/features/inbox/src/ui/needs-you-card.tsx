import { Button, List, usePresentation } from "@halonicjs/studio-kit";
import type { HomeCardProps } from "@halonicjs/studio-shell";
import { use, useCallback, useSyncExternalStore } from "react";
import { InboxService } from "../api.ts";
import type { Inbox } from "../inbox.ts";
import { rowFor } from "./inbox-row.ts";

/** How many rows Needs you shows on a phone before "See all N in Inbox" (PH 2.3). */
export const PHONE_ROWS = 3;

/** Home's Needs you card: the open workspace's Inbox, from `InboxService`. */
export function NeedsYouCard({ context }: HomeCardProps) {
  const { openPlace } = context;
  return (
    <NeedsYouView
      inbox={context.services.get(InboxService)}
      {...(openPlace === undefined ? {} : { openInbox: () => openPlace("inbox") })}
    />
  );
}

/** Props for {@link NeedsYouView}. */
export interface NeedsYouViewProps {
  readonly inbox: Inbox;
  /** Opens the Inbox place; left out where the card isn't in a window, so rows can't open. */
  readonly openInbox?: () => void;
  /** The clock for the waiting times; tests pass a fixed one. */
  readonly now?: () => Date;
}

/**
 * Home's Needs you (UX checklist T2 1.9, PH 2.3): the Inbox's rows, newest first, under the
 * heading the shell draws with the Inbox's count. Rows have no button: Enter or a click opens the
 * item's card in the Inbox. On a phone, the first three, then **See all N in Inbox**. With nothing
 * waiting, the one line "Nothing is waiting for you." and the heading stays.
 *
 * The section shows its skeleton until the Inbox's first list loads, and its error with **Try
 * again** if that load fails; a later failed load keeps the rows as they were.
 */
export function NeedsYouView({ inbox, openInbox, now = () => new Date() }: NeedsYouViewProps) {
  const subscribe = useCallback((listener: () => void) => inbox.subscribe(listener), [inbox]);
  const state = useSyncExternalStore(subscribe, () => inbox.state);
  const phone = usePresentation() === "phone";
  // Called on every render, as React asks: the promise stays settled once the first list is in.
  use(firstLoad(inbox));
  const shown = phone ? state.items.slice(0, PHONE_ROWS) : state.items;
  const open = (key: string) => {
    inbox.requestOpen(key);
    openInbox?.();
  };

  return (
    <>
      <List
        label="Needs you"
        rows={shown.map((item) => rowFor(item, now()))}
        {...(openInbox === undefined ? {} : { onOpen: open })}
        empty={{ title: "Nothing is waiting for you.", plain: true }}
      />
      {phone && openInbox !== undefined && state.items.length > PHONE_ROWS ? (
        <Button variant="ghost" size="touch" onClick={openInbox}>
          {`See all ${state.items.length} in Inbox`}
        </Button>
      ) : null}
    </>
  );
}

/** The first load of each Inbox: on its way, or done. */
const firstLoads = new WeakMap<Inbox, Promise<void>>();

/**
 * Settles when the Inbox's first list has loaded, or fails with the reason it couldn't, so the
 * section shows its skeleton, then its rows or its error. A failed load is forgotten, so the
 * section's **Try again**, which mounts the card again, loads the Inbox again.
 */
function firstLoad(inbox: Inbox): Promise<void> {
  const known = firstLoads.get(inbox);
  if (known !== undefined) return known;
  if (inbox.state.loaded) {
    const done = Promise.resolve();
    firstLoads.set(inbox, done);
    return done;
  }
  const load = new Promise<void>((resolve, reject) => {
    let stop = () => {};
    const settle = () => {
      const { loaded, error } = inbox.state;
      if (!loaded && error === undefined) return;
      stop();
      if (loaded) {
        resolve();
      } else {
        firstLoads.delete(inbox);
        reject(error);
      }
    };
    stop = inbox.subscribe(settle);
  });
  firstLoads.set(inbox, load);
  // A load that failed before: this is Try again, so load again.
  if (inbox.state.error !== undefined) void inbox.refresh();
  return load;
}
