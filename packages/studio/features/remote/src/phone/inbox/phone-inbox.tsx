import { type InboxItem, inboxItemKind } from "@halonicjs/ports";
import {
  EmptyState,
  HandIcon,
  HelpIcon,
  ListHeading,
  LockIcon,
  SKELETON_AFTER_MS,
  SkeletonBar,
  StatusChip,
  waitingFor,
} from "@halonicjs/studio-kit";
import { useEffect, useId, useState } from "react";
import type { MessagingClient } from "../messaging-client.ts";
import type { RemoteView } from "../remote-view.ts";
import { answersOnPhone, InboxCard } from "./inbox-card.tsx";
import { askerLine, cardTitle } from "./inbox-text.ts";
import { inboxWords } from "./inbox-words.ts";
import type { PhoneInboxItems } from "./use-phone-inbox.ts";

/** The built risky row hint: the card's line without its full stop (wording p02a). */
const riskyRowHint = "Answer this on your computer";

/**
 * `p02a`, `p03d`: the Inbox tab of one computer, its open cards oldest first under "Needs you".
 * Tapping a card opens it in place of the list; Back or Next comes back to the list. `items` come
 * from `usePhoneInbox`, read by the screen so the tab bar can count them too.
 */
export function PhoneInbox({
  items,
  view,
  messaging,
  computer,
  onOpenSettings,
}: {
  readonly items: PhoneInboxItems;
  readonly view: RemoteView;
  readonly messaging: MessagingClient;
  readonly computer: string;
  readonly onOpenSettings: () => void;
}) {
  // The card the person opened, kept as it was so it still shows after its answer leaves the list.
  const [opened, setOpened] = useState<InboxItem | undefined>(undefined);
  if (opened !== undefined) {
    return (
      <InboxCard
        item={opened}
        view={view}
        messaging={messaging}
        computer={computer}
        onBack={() => setOpened(undefined)}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  if (items === undefined) return <InboxLoading />;
  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-center">
        <EmptyState title={inboxWords.emptyTitle} description={inboxWords.emptyText} />
      </div>
    );
  }
  return <InboxList items={items} view={view} onOpen={setOpened} />;
}

/**
 * While the first read hasn't landed: nothing for a moment, then the heading's and three rows'
 * skeleton bars, as the Messenger's lists (#6310). A screen reader hears "Loading the Inbox".
 */
function InboxLoading() {
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    const show = setTimeout(() => setShowing(true), SKELETON_AFTER_MS);
    return () => clearTimeout(show);
  }, []);
  return (
    <div className="-mx-4 -mt-4 flex flex-col">
      <p role="status" className="sr-only">
        {inboxWords.loading}
      </p>
      {showing ? (
        <>
          <div className="px-4 pt-4 pb-1">
            <SkeletonBar kind="heading" />
          </div>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-start gap-3 border-b border-border px-4 py-3">
              <SkeletonBar kind="icon" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <SkeletonBar kind="title" width="2/3" />
                <SkeletonBar kind="meta" width="2/5" />
              </div>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

/** `p02a`: the open cards under "Needs you · n waiting", each a flat row that opens it. */
function InboxList({
  items,
  view,
  onOpen,
}: {
  readonly items: readonly InboxItem[];
  readonly view: RemoteView;
  readonly onOpen: (item: InboxItem) => void;
}) {
  const titleId = useId();
  const now = new Date();
  return (
    // The rows run edge to edge, their rules across the whole screen.
    <section aria-labelledby={titleId} className="-mx-4 -mt-4 flex flex-col">
      <ListHeading
        id={titleId}
        name={inboxWords.needsYou}
        detail={inboxWords.waiting(items.length)}
      />
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="border-b border-border">
            <button
              type="button"
              className="flex w-full items-start gap-3 px-4 py-3 text-left focus-ring-inset"
              onClick={() => onOpen(item)}
            >
              <span
                aria-hidden="true"
                className="mt-0.5 size-icon-md shrink-0 text-fg-muted *:size-full"
              >
                {inboxItemKind(item) === "approval" ? <HandIcon /> : <HelpIcon />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-body-strong text-fg">{cardTitle(item)}</span>
                <span className="text-small text-fg-muted">{askerLine(item)}</span>
                {answersOnPhone(item, view) ? null : (
                  <span className="flex items-center gap-1 text-small text-fg-muted">
                    <span aria-hidden="true" className="size-4 shrink-0 *:size-full">
                      <LockIcon />
                    </span>
                    {riskyRowHint}
                  </span>
                )}
              </span>
              <StatusChip>{waitingFor(new Date(item.createdAt), now)}</StatusChip>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
