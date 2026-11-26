import type { InboxItem } from "@halonicjs/ports";
import { useEffect, useState } from "react";
import type { MessagingClient } from "../messaging-client.ts";

/** The most pages of the Inbox the phone reads in one go, so a host can't keep it reading. */
const maxPages = 20;

/** The open items of the computer's Inbox, oldest first; `undefined` until the first read lands. */
export type PhoneInboxItems = readonly InboxItem[] | undefined;

/**
 * Reads the whole Inbox through `messaging` while the view is `live`, and again each time the host
 * says a source changed. A read that fails keeps what the phone had: the stale banner says how old
 * it is, and the next change or reconnect reads again. Kept in memory only.
 */
export function usePhoneInbox(messaging: MessagingClient | undefined, live: boolean) {
  const [items, setItems] = useState<PhoneInboxItems>(undefined);
  useEffect(() => {
    if (messaging === undefined || !live) return;
    let current = true;
    const read = () => {
      void readAll(messaging).then((read) => {
        if (current && read !== undefined) setItems(read);
      });
    };
    read();
    const unwatch = messaging.watch(read);
    return () => {
      current = false;
      unwatch();
    };
  }, [messaging, live]);
  return items;
}

/** Every page of the Inbox, its open items only; `undefined` when a page didn't come. */
async function readAll(messaging: MessagingClient): Promise<readonly InboxItem[] | undefined> {
  const items: InboxItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const outcome = await messaging.readList("inbox", cursor);
    if (outcome.kind !== "done") return undefined;
    items.push(...outcome.value.items.filter(isInboxItem));
    cursor = outcome.value.more;
    if (cursor === undefined) break;
  }
  return items.filter((item) => item.state.kind === "open");
}

/**
 * The host's page only checked each item is an object, so the parts the screens read are checked
 * here; an item without them isn't shown, rather than breaking the whole Inbox.
 */
function isInboxItem(value: unknown): value is InboxItem {
  const item = value as Partial<Record<keyof InboxItem, unknown>>;
  const options = item.options;
  return (
    typeof item.id === "string" &&
    typeof item.question === "string" &&
    typeof item.createdAt === "string" &&
    typeof (item.from as { kind?: unknown } | undefined)?.kind === "string" &&
    typeof (item.state as { kind?: unknown } | undefined)?.kind === "string" &&
    Array.isArray(options) &&
    options.every((option: { id?: unknown; label?: unknown }) => {
      return typeof option?.id === "string" && typeof option.label === "string";
    })
  );
}
