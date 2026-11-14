import { Button, EmptyState, List, usePresentation } from "@halonicjs/studio-kit";
import { errorMessageFor, type PlaceViewProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { InboxService } from "../api.ts";
import type { Inbox } from "../inbox.ts";
import type { InboxItem } from "../inbox-items.ts";
import { ApprovalCard } from "./approval-card.tsx";
import type { NextItem } from "./card-parts.tsx";
import { countDetail, itemTitle, lateCount, rowFor } from "./inbox-row.tsx";
import { SetupPane } from "./setup-pane.tsx";
import { WaitCard } from "./wait-card.tsx";

const loadFailed = "Couldn't load the Inbox";
/** Said when a load fails with no reason of its own (microcopy 10.1). */
const notAnswering = "The engine isn't answering. It may still be starting.";
/** Over the list when a later load fails: the items are the last ones that loaded (mc 10.1). */
const showingLast = "The engine isn't answering. Showing what it said last.";

/** The Inbox place's page: the open workspace's Inbox, from `InboxService`. */
export function InboxPage({ context }: PlaceViewProps) {
  return <InboxView inbox={context.services.get(InboxService)} />;
}

/** Props for {@link InboxView}. */
export interface InboxViewProps {
  readonly inbox: Inbox;
  /** The clock for the waiting times; tests pass a fixed one. */
  readonly now?: () => Date;
}

/**
 * The Inbox (flow-inbox 3.1, UX checklist 2.1, 2.3, 2.9 and 2.10): "Inbox", then Needs you, a
 * grid of what waits for you, setup items first, then newest first, with its count in the heading
 * ("Needs you, 2 waiting"), beside the open item's card. Nothing is open at first, unless Home's Needs you asked
 * for an item (`Inbox.requestOpen`). Enter or a click opens a
 * row's card, which takes focus; once decided, the card stays, with **Next** to the next item.
 *
 * A setup item opens its source's view (`SetupPane`); **Not now** and Escape close it and put
 * focus back on its row.
 *
 * On a phone (HAL-8778, phone layout 5) the list is the whole page, and an open item replaces it
 * as a page with **Back to Inbox**; the top bar already says "Inbox", so the page's own heading is
 * for screen readers only.
 *
 * Not here yet: notices, the request form, the narrow layout (HAL-1305), and
 * **Open run**, which comes with the run page.
 */
export function InboxView({ inbox, now = () => new Date() }: InboxViewProps) {
  const subscribe = useCallback((listener: () => void) => inbox.subscribe(listener), [inbox]);
  const state = useSyncExternalStore(subscribe, () => inbox.state);
  // The open item, kept here rather than looked up in the list: once you answer it, it leaves
  // the list, but its card stays to say what you decided.
  const [open, setOpen] = useState<InboxItem | null>(null);
  // Where the open row was when last seen in the list: once it leaves, the item that moves into
  // its place is the next one.
  const openIndex = open === null ? -1 : state.items.findIndex((item) => item.key === open.key);
  const openAt = useRef(-1);
  useEffect(() => {
    if (openIndex !== -1) openAt.current = openIndex;
  }, [openIndex]);
  // An open setup item follows its source's latest step, and keeps the last one once it's done.
  useEffect(() => {
    if (open?.kind !== "setup") return;
    const latest = state.items.find((item) => item.key === open.key);
    if (latest !== undefined && latest !== open) setOpen(latest);
  }, [state.items, open]);
  // Home's Needs you asks for an item before it opens the Inbox; take it now and on each change.
  useEffect(() => {
    const take = () => {
      const asked = inbox.takeOpenRequest();
      if (asked !== undefined) setOpen(asked);
    };
    take();
    return inbox.subscribe(take);
  }, [inbox]);
  const retry = () => void inbox.refresh();
  const list = useRef<HTMLDivElement>(null);
  // Not now: the pane empties and focus goes back to the row the item was open from.
  const close = () => {
    const row = list.current?.querySelector<HTMLElement>(
      'tr[aria-current="true"] [role="gridcell"]',
    );
    // On a phone the list is hidden until the item closes, and a hidden row can't take focus.
    flushSync(() => setOpen(null));
    row?.focus();
  };
  const failedFirst = !state.loaded && state.error !== undefined;
  const phone = usePresentation() === "phone";
  const itemPage = phone && open !== null;

  return (
    <div className="flex h-full min-h-0 w-full">
      <div data-pane="list" className={listPaneClass(phone, itemPage)}>
        <header className={phone ? "sr-only" : "flex items-center px-4 py-3"}>
          <h1 className="text-title">Inbox</h1>
        </header>
        {state.loaded && state.error !== undefined ? (
          <p className="px-4 pb-2 text-small text-fg-muted">{showingLast}</p>
        ) : null}
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {failedFirst ? (
            <EmptyState
              tone="error"
              align="start"
              title={loadFailed}
              description={failureReason(state.error)}
              action={{ label: "Try again", onClick: retry }}
            />
          ) : (
            <List
              heading={{
                name: "Needs you",
                ...countDetail(state.items.length, lateCount(state.items, now())),
              }}
              rows={state.items.map((item) => rowFor(item, now()))}
              onOpen={(key) => setOpen(state.items.find((item) => item.key === key) ?? null)}
              {...(open === null ? {} : { current: open.key })}
              empty={{ title: "Nothing is waiting for you.", plain: true }}
              loading={!state.loaded}
              loadingLabel="Loading the Inbox"
              onRetry={retry}
            />
          )}
        </div>
      </div>
      <div
        data-pane="item"
        className={`${phone && open === null ? "hidden" : "flex"} min-w-0 flex-1 justify-center overflow-y-auto`}
      >
        <div className="flex w-full max-w-190 flex-col">
          {itemPage ? (
            <div className="px-2 pt-2">
              <Button variant="ghost" size="touch" onClick={close}>
                Back to Inbox
              </Button>
            </div>
          ) : null}
          {open === null ? (
            <NothingOpen loaded={state.loaded} waiting={state.items.length} />
          ) : (
            <OpenCard
              key={open.key}
              item={open}
              inbox={inbox}
              next={nextItem(state.items, open, openAt.current, setOpen)}
              now={now}
              answering={state.error === undefined}
              close={close}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The list's column: 360 px beside the card, the whole page on a phone, and gone while an item is open. */
function listPaneClass(phone: boolean, itemOpen: boolean): string {
  if (!phone) return "flex w-90 shrink-0 flex-col border-e border-border";
  return `${itemOpen ? "hidden" : "flex"} w-full flex-col`;
}

/**
 * The next item for the decided card's **Next**: the one after the open one, else the first. Once
 * the open item has left the list, the one after it is the item now at `openAt`, where it was.
 */
function nextItem(
  items: readonly InboxItem[],
  open: InboxItem,
  openAt: number,
  setOpen: (item: InboxItem) => void,
): NextItem | null {
  const others = items.filter((item) => item.key !== open.key);
  const index = items.findIndex((item) => item.key === open.key);
  const after = index === -1 ? items[openAt] : items[index + 1];
  const next = after ?? others[0];
  if (next === undefined) return null;
  return {
    title: itemTitle(next),
    left: others.length,
    open: () => setOpen(next),
  };
}

function OpenCard({
  item,
  inbox,
  next,
  now,
  answering,
  close,
}: {
  readonly item: InboxItem;
  readonly inbox: Inbox;
  readonly next: NextItem | null;
  readonly now: () => Date;
  readonly answering: boolean;
  readonly close: () => void;
}) {
  if (item.kind === "setup") {
    return (
      <SetupPane
        item={item}
        source={inbox.setupSource(item.provider)}
        answering={answering}
        close={close}
      />
    );
  }
  if (item.kind === "approval") {
    return (
      <ApprovalCard
        item={item}
        agentName={item.agent}
        subagentName={item.subagent}
        decisions={inbox.decisions}
        next={next}
        back={null}
        now={now}
      />
    );
  }
  return <WaitCard item={item} decisions={inbox.decisions} next={next} back={null} now={now} />;
}

/** The right pane with nothing open (UX checklist 2.3), without the request form for now. */
function NothingOpen({ loaded, waiting }: { readonly loaded: boolean; readonly waiting: number }) {
  if (!loaded) return null;
  if (waiting > 0) {
    return (
      <p className="m-auto p-6 text-center text-body text-fg-muted">
        Pick something on the left to see it here.
      </p>
    );
  }
  return (
    <div className="m-auto p-6">
      <EmptyState
        title="Nothing is waiting for you"
        description="Approvals and questions from your runs show up here."
      />
    </div>
  );
}

/**
 * Why the Inbox couldn't load: a kinded error's own reason, else that the engine isn't answering,
 * as mc 10.1 says it, since a load that fails without a kind never reached the engine.
 */
function failureReason(error: unknown): string {
  const message = errorMessageFor(error, { title: loadFailed });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? notAnswering : reason;
}
