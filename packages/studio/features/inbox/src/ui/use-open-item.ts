import { useEffect, useRef, useState } from "react";
import type { Inbox, SetupFocus } from "../inbox.ts";
import type { InboxItem } from "../inbox-items.ts";

/** The item open in the Inbox's pane, and how to change it. */
export interface OpenItem {
  /**
   * The open item, kept here rather than looked up in the list: once you answer it, it leaves
   * the list, but its card stays to say what you decided.
   */
  readonly open: InboxItem | null;
  /** What the open setup item was asked to reach, such as its secret field; opening a row by hand asks for nothing. */
  readonly focus: SetupFocus | undefined;
  /** Opens an item by hand, or closes the pane with `null`. */
  readonly openItem: (item: InboxItem | null) => void;
  /** Where the open row was when last seen in the list, so the item that moves into its place is the next one. */
  readonly openAt: { readonly current: number };
}

/**
 * The open item: it follows its setup source's latest step, keeps the last one once the setup is
 * done, and opens what Home's Needs you or another page asked for (`Inbox.requestOpen`), now and
 * on each change.
 */
export function useOpenItem(inbox: Inbox, items: readonly InboxItem[]): OpenItem {
  const [open, setOpen] = useState<InboxItem | null>(null);
  const [focus, setFocus] = useState<SetupFocus | undefined>(undefined);
  const openIndex = open === null ? -1 : items.findIndex((item) => item.key === open.key);
  const openAt = useRef(-1);
  useEffect(() => {
    if (openIndex !== -1) openAt.current = openIndex;
  }, [openIndex]);
  useEffect(() => {
    if (open?.kind !== "setup") return;
    const latest = items.find((item) => item.key === open.key);
    if (latest !== undefined && latest !== open) setOpen(latest);
  }, [items, open]);
  // A fixed item only stays while it is open: the source drops it once it isn't (or the page closes).
  useEffect(
    () => () => {
      if (open?.kind === "setup") inbox.releaseSetup(open);
    },
    [inbox, open],
  );
  useEffect(() => {
    const take = () => {
      const asked = inbox.takeOpenRequest();
      if (asked === undefined) return;
      setFocus(inbox.takeOpenFocus());
      setOpen(asked);
    };
    take();
    return inbox.subscribe(take);
  }, [inbox]);
  const openItem = (item: InboxItem | null) => {
    setFocus(undefined);
    setOpen(item);
  };
  return { open, focus, openItem, openAt };
}
