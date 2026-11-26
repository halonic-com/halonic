import type { InboxItem } from "@halonicjs/ports";
import { EmptyState } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import type { MessagingClient } from "../messaging-client.ts";
import type { RemoteView } from "../remote-view.ts";
import { answersOnPhone, InboxCard } from "./inbox-card.tsx";
import { inboxWords } from "./inbox-words.ts";
import { usePhoneInbox } from "./use-phone-inbox.ts";

/** The built risky row hint: the card's line without its full stop (wording p02a). */
const riskyRowHint = "Answer this on your computer";

/**
 * `p02a`, `p03d`: the Inbox tab of one computer, its open cards oldest first under "Needs you".
 * Tapping a card opens it in place of the list; Back or Next comes back to the list.
 */
export function PhoneInbox({
  view,
  messaging,
  computer,
  onOpenSettings,
}: {
  readonly view: RemoteView;
  readonly messaging: MessagingClient;
  readonly computer: string;
  readonly onOpenSettings: () => void;
}) {
  const items = usePhoneInbox(messaging, view.canAnswer);
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
  if (items === undefined) {
    return (
      <p role="status" className="text-small text-fg-muted">
        {inboxWords.loading}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-center">
        <EmptyState title={inboxWords.emptyTitle} description={inboxWords.emptyText} />
      </div>
    );
  }
  return <InboxList items={items} view={view} onOpen={setOpened} />;
}

/** `p02a`: the open cards under "Needs you · n waiting", each a row that opens it. */
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
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-body-strong text-fg">
        {inboxWords.needsYou}{" "}
        <span className="text-fg-muted">· {inboxWords.waiting(items.length)}</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="flex w-full flex-col gap-1 rounded-md border border-border px-4 py-3 text-left focus-ring"
              onClick={() => onOpen(item)}
            >
              <span className="text-body-strong text-fg">
                {item.from.kind === "agent" ? item.from.name : inboxWords.needsYou}
              </span>
              <span className="line-clamp-2 text-small text-fg">{item.question}</span>
              {answersOnPhone(item, view) ? null : (
                <span className="text-small text-fg-muted">{riskyRowHint}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
