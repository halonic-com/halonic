import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import { Button, List, usePresentation } from "@halonicjs/studio-kit";
import { firstLoad, type HomeCardProps } from "@halonicjs/studio-shell";
import { use, useCallback, useSyncExternalStore } from "react";
import { InboxService } from "../api.ts";
import type { Inbox } from "../inbox.ts";
import { inboxRow } from "./inbox-row.tsx";
import type { RunFactsOf } from "./run-facts.ts";
import { useRunFacts } from "./use-run-facts.ts";

/** How many rows Needs you shows on a phone before "See all N in Inbox" (PH 2.3). */
export const PHONE_ROWS = 3;

/** Home's Needs you card: the open workspace's Inbox, from `InboxService`. */
export function NeedsYouCard({ context, attempt }: HomeCardProps) {
  const { openPlace } = context;
  const runFacts = useRunFacts(context.services.find(RunsListService));
  return (
    <NeedsYouView
      inbox={context.services.get(InboxService)}
      runFacts={runFacts}
      attempt={attempt}
      {...(openPlace === undefined ? {} : { openInbox: () => openPlace("inbox") })}
    />
  );
}

/** Props for {@link NeedsYouView}. */
export interface NeedsYouViewProps {
  readonly inbox: Inbox;
  /** The facts of the run behind an item, so a row reads as the Inbox page's; without them it has none. */
  readonly runFacts?: RunFactsOf | undefined;
  /** Opens the Inbox place; left out where the card isn't in a window, so rows can't open. */
  readonly openInbox?: () => void;
  /** The clock for the waiting times; tests pass a fixed one. */
  readonly now?: () => Date;
  /** The section's Try again count from {@link HomeCardProps}; a new one loads again after a failed first load. */
  readonly attempt?: number;
}

/**
 * Home's Needs you (UX checklist T2 1.9, PH 2.3): the Inbox's rows, newest first, as the Inbox page
 * shows them, with their run's workflow, under the heading the shell draws with the Inbox's count. Rows have no button: Enter or a click opens the
 * item's card in the Inbox. On a phone, the first three, then **See all N in Inbox**. With nothing
 * waiting, the one line "Nothing is waiting for you." and the heading stays.
 *
 * The section shows its skeleton until the Inbox's first list loads, and its error with **Try
 * again** if that load fails; a later failed load keeps the rows as they were.
 */
export function NeedsYouView({
  inbox,
  runFacts,
  openInbox,
  now = () => new Date(),
  attempt = 0,
}: NeedsYouViewProps) {
  const subscribe = useCallback((listener: () => void) => inbox.subscribe(listener), [inbox]);
  const state = useSyncExternalStore(subscribe, () => inbox.state);
  const phone = usePresentation() === "phone";
  // Called on every render, as React asks: the promise stays settled once the first list is in.
  use(firstLoad(inbox, attempt));
  // A fixed setup item stays in the Inbox while it is open, but nothing waits on it.
  const waiting = state.items.filter((item) => item.kind !== "setup" || item.fixed !== true);
  const shown = phone ? waiting.slice(0, PHONE_ROWS) : waiting;
  const open = (key: string) => {
    inbox.requestOpen(key);
    openInbox?.();
  };

  return (
    <>
      <List
        label="Needs you"
        rows={shown.map((item) => inboxRow(item, now(), runFacts))}
        {...(openInbox === undefined ? {} : { onOpen: open })}
        empty={{ title: "Nothing is waiting for you.", plain: true }}
      />
      {phone && openInbox !== undefined && waiting.length > PHONE_ROWS ? (
        <Button variant="ghost" size="touch" onClick={openInbox}>
          {`See all ${waiting.length} in Inbox`}
        </Button>
      ) : null}
    </>
  );
}
