import type { MessagingId } from "@halonicjs/ports";
import type { ChatClicks } from "@halonicjs/studio-services";
import { useEffect, useRef } from "react";

/**
 * Opens the chats the desktop shell hands Messenger's window (`messenger.handed-chats`): the one
 * quick ask's box opened the window on, once the page starts, then every later one. Without the
 * shell's chats, as in a browser or in Studio's window, it does nothing.
 */
export function useHandedChats(
  chats: ChatClicks | undefined,
  open: (chat: MessagingId) => void,
): void {
  // Read through a ref, so a new `open` on a later draw neither hears twice nor drops the waiting
  // chat, which the shell hands over only once.
  const current = useRef(open);
  current.current = open;
  useEffect(() => {
    if (chats === undefined) return;
    let stopped = false;
    void chats.takePending().then((chat) => {
      if (chat !== undefined && !stopped) current.current(chat);
    });
    const stopHearing = chats.subscribe((chat) => current.current(chat));
    return () => {
      stopped = true;
      stopHearing();
    };
  }, [chats]);
}
