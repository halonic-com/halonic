import type { InboxItem, MessagingId, MessagingSource, WorkItem } from "@halonicjs/ports";
import { useEffect, useState } from "react";
import type { MessagingClient, MessagingList } from "../messaging-client.ts";

/** The most pages of a list the phone reads in one go, so a host can't keep it reading. */
const maxPages = 20;

/** The open items of the computer's Inbox, oldest first; `undefined` until the first read lands. */
export type PhoneInboxItems = readonly InboxItem[] | undefined;

/** What the Inbox's rows and cards say round an item: its source's label and its work. */
export interface PhoneInboxNames {
  /** "Paperclip · Halonic", by source. */
  readonly sources: ReadonlyMap<MessagingId, string>;
  readonly work: ReadonlyMap<MessagingId, WorkItem>;
}

const noNames: PhoneInboxNames = { sources: new Map(), work: new Map() };

/**
 * Reads the whole Inbox through `messaging` while the view is `live`, and again each time the host
 * says a source changed; then the sources and the work the rows name. A read that fails keeps what
 * the phone had: the stale banner says how old it is, and the next change or reconnect reads again.
 * Kept in memory only.
 */
export function usePhoneInbox(messaging: MessagingClient | undefined, live: boolean) {
  const [items, setItems] = useState<PhoneInboxItems>(undefined);
  const [names, setNames] = useState<PhoneInboxNames>(noNames);
  useEffect(() => {
    if (messaging === undefined || !live) return;
    let current = true;
    const read = () => {
      void readAll(messaging, "inbox", isInboxItem)
        .then((read) => {
          if (!current || read === undefined) return;
          setItems(read.filter((item) => item.state.kind === "open"));
          return readNames(messaging);
        })
        .then((read) => {
          if (current && read !== undefined) setNames(read);
        });
    };
    read();
    const unwatch = messaging.watch(read);
    return () => {
      current = false;
      unwatch();
    };
  }, [messaging, live]);
  return { items, names };
}

/** The sources' labels and the work items; what was read keeps its place when the other fails. */
async function readNames(messaging: MessagingClient): Promise<PhoneInboxNames> {
  const sources = await readAll(messaging, "sources", isSource);
  const work = await readAll(messaging, "work", isWork);
  return {
    sources: new Map((sources ?? []).map((source) => [source.id, source.label])),
    work: new Map((work ?? []).map((each) => [each.id, each])),
  };
}

/** Every page of `what`, the items `isItem` passes; `undefined` when a page didn't come. */
async function readAll<Item>(
  messaging: MessagingClient,
  what: MessagingList,
  isItem: (value: unknown) => value is Item,
): Promise<readonly Item[] | undefined> {
  const items: Item[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const outcome = await messaging.readList(what, cursor);
    if (outcome.kind !== "done") return undefined;
    items.push(...outcome.value.items.filter(isItem));
    cursor = outcome.value.more;
    if (cursor === undefined) break;
  }
  return items;
}

type Fields<T> = Partial<Record<keyof T, unknown>>;

/**
 * The host's page only checked each item is an object, so the parts the screens read are checked
 * here; an item without them isn't shown, rather than breaking the whole Inbox.
 */
function isInboxItem(value: unknown): value is InboxItem {
  const item = value as Fields<InboxItem>;
  const options = item.options;
  const project = item.project as Fields<InboxItem["project"] & object> | undefined;
  const from = item.from as { kind?: unknown; name?: unknown } | undefined;
  return (
    typeof item.id === "string" &&
    typeof item.question === "string" &&
    typeof item.createdAt === "string" &&
    (from?.kind === "me" || (typeof from?.kind === "string" && typeof from.name === "string")) &&
    typeof (item.state as { kind?: unknown } | undefined)?.kind === "string" &&
    (project === undefined ||
      (typeof project.id === "string" && typeof project.name === "string")) &&
    Array.isArray(options) &&
    options.every((option: { id?: unknown; label?: unknown }) => {
      return typeof option?.id === "string" && typeof option.label === "string";
    })
  );
}

function isSource(value: unknown): value is MessagingSource {
  const source = value as Fields<MessagingSource>;
  return typeof source.id === "string" && typeof source.label === "string";
}

function isWork(value: unknown): value is WorkItem {
  const work = value as Fields<WorkItem>;
  return typeof work.id === "string" && typeof work.label === "string";
}
