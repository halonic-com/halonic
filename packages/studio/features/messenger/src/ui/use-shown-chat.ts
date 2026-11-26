import type { MessagingId } from "@halonicjs/ports";
import { useEffect, useRef } from "react";
import type { Messenger } from "../messenger.ts";

/**
 * Tells the Messenger which chat the page shows, so its window keeps it, and opens a chat the
 * window asked for as it reopened, now or when it's asked (`messenger.window-chat`).
 */
export function useShownChat(
  messenger: Messenger,
  shown: MessagingId | undefined,
  open: (conversation: MessagingId) => void,
): void {
  const opening = useRef(open);
  opening.current = open;
  useEffect(() => {
    messenger.shown.note(shown);
  }, [messenger, shown]);
  useEffect(() => {
    const take = () => {
      const asked = messenger.shown.take();
      if (asked !== undefined) opening.current(asked);
    };
    take();
    return messenger.shown.onAsked(take);
  }, [messenger]);
}
