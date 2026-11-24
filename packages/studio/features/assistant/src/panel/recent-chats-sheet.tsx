import { List, type ListRow, SidePanel, StatusChip } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef } from "react";
import type { AssistantHost, ChatSummary } from "../api.ts";
import type { BuildChats } from "../chat/build-chats.ts";
import { chatTime, chatMenuWords as words } from "../chat/chat-menu-words.ts";
import { useRecentChats } from "./chat-header.tsx";

/** Props for {@link RecentChatsSheet}. */
export interface RecentChatsSheetProps {
  readonly host: AssistantHost;
  readonly chats: BuildChats;
  /** The chat the panel shows, marked as the current row. */
  readonly currentId: string | undefined;
  /** After a row's chat is shown in the panel, in place of the one before. */
  readonly onPicked: () => void;
  /** Back, and Escape while focus is in the sheet: the chat as it was. */
  readonly onClose: () => void;
}

/**
 * ⋮ › **Recent chats** on a phone (`assistant.chat.phone-screen`, flow-assistant 11.3): a panel
 * sheet over the chat with the kept Build chats as a flush List, most recently used first. Each
 * row has its title, when it was last used under it, and at the right the running dot or "2 to
 * review". Agent chats aren't listed: on a phone they're on their agent's Try it. The footer says
 * how many chats are kept.
 */
export function RecentChatsSheet({
  host,
  chats,
  currentId,
  onPicked,
  onClose,
}: RecentChatsSheetProps) {
  const recent = useRecentChats(host).filter((chat) => chat.kind === "build");
  const frame = useEscapeCloses(onClose);
  const now = new Date();
  const rows: ListRow[] = recent.map((chat) => {
    const time = chatTime(chat.lastUsedAt, now);
    return {
      id: chat.id,
      title: chat.title,
      wrapTitle: true,
      meta: time,
      trailing: trailingOf(chat),
      label: words.rowName(chat.title, time, chat.answering, chat.itemsToReview),
    };
  });
  return (
    <div ref={frame} className="absolute inset-0 z-10 flex flex-col bg-surface">
      <SidePanel title={words.phone.recentChats} onClose={onClose}>
        {rows.length === 0 ? null : (
          <div className="-mx-4 -mt-3">
            <List
              label={words.phone.recentChats}
              rows={rows}
              {...(currentId === undefined ? {} : { current: currentId })}
              onOpen={(id) => void chats.pick(id).then(onPicked)}
            />
          </div>
        )}
        <p className="pt-3 text-small text-fg-muted">{words.phone.footer}</p>
      </SidePanel>
    </div>
  );
}

/** The row's one job on the right: the running dot while it answers, else what's left to review. */
function trailingOf(chat: ChatSummary): ReactNode {
  if (chat.answering) {
    return (
      <span className="size-1.5 shrink-0 rounded-full bg-running forced-color-adjust-none forced-colors:bg-[CanvasText]" />
    );
  }
  if (chat.itemsToReview > 0) return <StatusChip>{words.toReview(chat.itemsToReview)}</StatusChip>;
  return undefined;
}

/** Escape while focus is in the sheet closes it alone; the shell's close stack isn't open to features. */
function useEscapeCloses(onClose: () => void) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = frame.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    element?.addEventListener("keydown", onKeyDown);
    return () => element?.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return frame;
}
