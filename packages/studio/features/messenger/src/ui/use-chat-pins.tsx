import { createContext, type ReactNode, use, useMemo, useState } from "react";
import { type ChatPins, isRowOf, type PinnedChat, StoredChatPins } from "../chat-pins.ts";
import type { ConversationRow } from "../messenger.ts";

/** The Messenger page's pins, shared by its list and its open chat's menu. */
export interface ChatPinning {
  /** The pinned chats, the most recently pinned first. */
  readonly pinned: readonly PinnedChat[];
  /** Whether a row's chat is pinned. */
  readonly isPinned: (row: ConversationRow) => boolean;
  /** Pins a row's chat, or unpins it when it's pinned. */
  readonly toggle: (row: ConversationRow) => void;
  /** The last pin found all the pins taken, until the next pin or unpin. */
  readonly full: boolean;
  /** Grows on each pin that finds them all taken, so the page's status reads every try. */
  readonly fullCount: number;
}

const PinsContext = createContext<ChatPinning | undefined>(undefined);

/** The page's pins for its list and its open chat; none outside a {@link ChatPinsProvider}. */
export function useChatPins(): ChatPinning | undefined {
  return use(PinsContext);
}

/**
 * The Messenger page's pins (`messenger.pinned-chats`), kept on this device; `given` stands in for
 * the device's storage in tests. Only pins whose chats are in `rows` count toward the limit.
 */
export function useChatPinning(
  given: ChatPins | undefined,
  rows: readonly ConversationRow[] | undefined,
): ChatPinning {
  const pins = useMemo(() => given ?? new StoredChatPins(globalThis.localStorage ?? null), [given]);
  const [pinned, setPinned] = useState(() => pins.list());
  const [full, setFull] = useState({ shown: false, count: 0 });
  return useMemo<ChatPinning>(() => {
    const isPinned = (row: ConversationRow) => pinned.some((pin) => isRowOf(row, pin));
    const isListed = (pin: PinnedChat) => (rows ?? []).some((row) => isRowOf(row, pin));
    const toggle = (row: ConversationRow) => {
      const chat = { source: row.conversation.source, conversation: row.conversation.id };
      const wasFull = !isPinned(row) && pins.pin(chat, isListed) === "full";
      if (isPinned(row)) pins.unpin(chat);
      setFull((last) => ({ shown: wasFull, count: last.count + (wasFull ? 1 : 0) }));
      setPinned(pins.list());
    };
    return { pinned, isPinned, toggle, full: full.shown, fullCount: full.count };
  }, [pins, pinned, full, rows]);
}

/** Gives the page's list and open chat the pins {@link useChatPinning} keeps. */
export function ChatPinsProvider({
  value,
  children,
}: {
  readonly value: ChatPinning;
  readonly children: ReactNode;
}) {
  return <PinsContext value={value}>{children}</PinsContext>;
}
