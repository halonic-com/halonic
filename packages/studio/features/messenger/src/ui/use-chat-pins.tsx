import { createContext, type ReactNode, use, useMemo, useState } from "react";
import { type ChatPins, type PinnedChat, StoredChatPins } from "../chat-pins.ts";
import type { ConversationRow } from "../messenger.ts";

/** The Messenger page's pins as the list and the open chat's menu share them (`messenger.pinned-chats`). */
export interface ChatPinning {
  /** The pinned chats, the most recently pinned first. */
  readonly pinned: readonly PinnedChat[];
  /** Whether a row's chat is pinned. */
  readonly isPinned: (row: ConversationRow) => boolean;
  /** Pins a row's chat, or unpins it when it's pinned. */
  readonly toggle: (row: ConversationRow) => void;
  /** The last pin found all the pins taken, until the next pin or unpin. */
  readonly full: boolean;
}

const PinsContext = createContext<ChatPinning | undefined>(undefined);

/** The page's pins for its list and its open chat; none outside a {@link ChatPinsProvider}. */
export function useChatPins(): ChatPinning | undefined {
  return use(PinsContext);
}

/**
 * Gives the Messenger page's list and open chat one set of pins, kept on this device; a pin or an
 * unpin draws both again. `pins` stands in for the device's storage in tests.
 */
export function ChatPinsProvider({
  pins: given,
  children,
}: {
  readonly pins?: ChatPins | undefined;
  readonly children: ReactNode;
}) {
  const pins = useMemo(() => given ?? new StoredChatPins(globalThis.localStorage ?? null), [given]);
  const [pinned, setPinned] = useState(() => pins.list());
  const [full, setFull] = useState(false);
  const value = useMemo<ChatPinning>(() => {
    const isPinned = (row: ConversationRow) => pinned.some((pin) => isPinOf(pin, row));
    const toggle = (row: ConversationRow) => {
      const chat = { source: row.conversation.source, conversation: row.conversation.id };
      if (isPinned(row)) pins.unpin(chat);
      setFull(!isPinned(row) && pins.pin(chat) === "full");
      setPinned(pins.list());
    };
    return { pinned, isPinned, toggle, full };
  }, [pins, pinned, full]);
  return <PinsContext value={value}>{children}</PinsContext>;
}

function isPinOf(pin: PinnedChat, row: ConversationRow): boolean {
  return pin.source === row.conversation.source && pin.conversation === row.conversation.id;
}
