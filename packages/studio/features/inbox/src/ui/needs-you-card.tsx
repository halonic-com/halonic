import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import { Button, List, usePresentation } from "@halonicjs/studio-kit";
import {
  type EngineWords,
  engineWords,
  engineWordsOf,
  firstLoad,
  type HomeCardProps,
} from "@halonicjs/studio-shell";
import { type ReactNode, use, useCallback, useSyncExternalStore } from "react";
import { InboxService, type ServedHomeHint, ServedHomeHintService } from "../api.ts";
import type { Inbox } from "../inbox.ts";
import { inboxRow } from "./inbox-row.tsx";
import { SignedOutLine } from "./load-lines.tsx";
import type { RunFactsOf } from "./run-facts.ts";
import { useRunFacts } from "./use-run-facts.ts";

/** How many rows Needs you shows on a phone before "See all N in Inbox" (PH 2.3). */
export const PHONE_ROWS = 3;

/** Home's Needs you card: the open workspace's Inbox, from `InboxService`. */
export function NeedsYouCard({ context, attempt }: HomeCardProps) {
  const { openPlace } = context;
  const inbox = context.services.get(InboxService);
  const runFacts = useRunFacts(context.services.find(RunsListService), inbox);
  return (
    <NeedsYouView
      inbox={inbox}
      runFacts={runFacts}
      served={context.services.find(ServedHomeHintService)}
      words={engineWordsOf(context)}
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
  /** The engine words for this window's host, for a sign-in that ended with no reason of its own. */
  readonly words?: EngineWords;
  /** The served Studio's hint; with it an empty Needs you says what comes here (`inbox.home-next-step`). */
  readonly served?: ServedHomeHint | undefined;
}

/** The first line under an empty Needs you in a served Studio. */
const servedNextStep = "Runs that need your yes show up here.";

/** The line after it on the sample: how to start a run that will wait here. */
const servedDemoStep = "Start one on your computer: run the Support reply workflow in Studio.";

/** What an empty Needs you says under its title: nothing in the desktop app, the served lines otherwise. */
function nextStepOf(served: ServedHomeHint | undefined): ReactNode {
  if (served === undefined) return undefined;
  if (!served.isSample()) return servedNextStep;
  return (
    <>
      <span className="block">{servedNextStep}</span>
      <span className="block">{servedDemoStep}</span>
    </>
  );
}

/**
 * Home's Needs you (UX checklist T2 1.9, PH 2.3): the Inbox's rows, newest first, as the Inbox page
 * shows them, with their run's workflow, under the heading the shell draws with the Inbox's count. Rows have no button: Enter or a click opens the
 * item's card in the Inbox. On a phone, the first three, then **See all N in Inbox**. With nothing
 * waiting, the one line "Nothing is waiting for you." and the heading stays; a served Studio adds
 * where runs come from, and on the sample how to start one (`inbox.home-next-step`).
 *
 * The section shows its skeleton until the Inbox's first list loads, and its error with **Try
 * again** if that load fails; a later failed load keeps the rows as they were. When the served
 * Studio's sign-in ended, the Inbox's "Sign in again to …" line shows over them (HAL-13830 HM1).
 */
export function NeedsYouView({
  inbox,
  runFacts,
  openInbox,
  now = () => new Date(),
  attempt = 0,
  words = engineWords["desktop-app"],
  served,
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
      <SignedOutLine error={state.loaded ? state.error : undefined} words={words} />
      <List
        label="Needs you"
        rows={shown.map((item) => inboxRow(item, now(), runFacts))}
        {...(openInbox === undefined ? {} : { onOpen: open })}
        empty={{
          title: "Nothing is waiting for you.",
          plain: true,
          description: nextStepOf(served),
        }}
      />
      {phone && openInbox !== undefined && waiting.length > PHONE_ROWS ? (
        <Button variant="ghost" size="touch" onClick={openInbox}>
          {`See all ${waiting.length} in Inbox`}
        </Button>
      ) : null}
    </>
  );
}
