import type { MessagingId } from "@halonicjs/ports";
import type { ChatOpens } from "@halonicjs/studio-services";
import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * The hand-overs whose waiting chat has opened, so a page that starts again, as React's checks
 * start it twice, or after the workspace changed, doesn't open it twice.
 */
const pendingOpened = new WeakSet<ChatOpens>();

/**
 * Opens the chats quick ask's box hands over (requirement `messenger.open-from-quick-ask`): the
 * one that opened the window once the page starts, then every later one. Once the chat shows, at
 * its newest message as every chat opens, the focus goes in its box, so the person can answer at
 * once. Without hand-overs, as in a browser, it does nothing.
 *
 * @param opens - the shell's hand-overs, when there is a shell
 * @param open - shows a chat, as picking its row does
 * @param shown - the chat the panel shows now, if any
 * @param chat - the panel that holds the open chat's box
 */
export function useChatOpens(
  opens: ChatOpens | undefined,
  open: (conversation: MessagingId) => void,
  shown: MessagingId | undefined,
  chat: RefObject<HTMLElement | null>,
): void {
  // The chat waiting to show before its box takes the focus.
  const [focusFor, setFocusFor] = useState<MessagingId | undefined>(undefined);
  // Read through a ref, so a new `open` on a later draw neither hears twice nor drops the waiting
  // chat, which the shell hands over only once.
  const current = useRef(open);
  current.current = open;
  useEffect(() => {
    if (opens === undefined) return;
    let stopped = false;
    const handOver = (conversation: MessagingId) => {
      if (stopped) return;
      current.current(conversation);
      setFocusFor(conversation);
    };
    void opens.takePending().then((pending) => {
      if (pending === undefined || stopped || pendingOpened.has(opens)) return;
      pendingOpened.add(opens);
      handOver(pending);
    });
    const stopHearing = opens.subscribe(handOver);
    return () => {
      stopped = true;
      stopHearing();
    };
  }, [opens]);
  useEffect(() => {
    if (focusFor === undefined || focusFor !== shown) return;
    chat.current?.querySelector<HTMLElement>("textarea")?.focus();
    setFocusFor(undefined);
  }, [focusFor, shown, chat]);
}
