import { PlainList, PlainRow, SidePanel, useFormatLocale } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
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
 * sheet over the chat with the kept Build chats as plain rows, most recently used first, as the
 * Messenger's chats (`assistant.chat.recent-chats-dot`). Each row has its title, the violet dot
 * while it has items to review, and at the right when it was last used, after the running dot
 * while it answers. Agent chats aren't listed: on a phone they're on their agent's Try it. The
 * footer says how many chats are kept.
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
  const locale = useFormatLocale();
  const now = new Date();
  return (
    <div ref={frame} className="absolute inset-0 z-10 flex flex-col bg-surface">
      <SidePanel title={words.phone.recentChats} onClose={onClose}>
        {recent.length === 0 ? null : (
          <div className="-mx-3">
            <PlainList label={words.phone.recentChats}>
              {recent.map((chat) => (
                <PlainRow
                  key={chat.id}
                  id={chat.id}
                  picture={null}
                  title={chat.title}
                  flag={flagOf(chat)}
                  time={<RowTime chat={chat} now={now} locale={locale} />}
                  current={chat.id === currentId}
                  onSelect={() => void chats.pick(chat.id).then(onPicked)}
                />
              ))}
            </PlainList>
          </div>
        )}
        <p className="pt-3 text-small text-fg-muted">{words.phone.footer}</p>
      </SidePanel>
    </div>
  );
}

/** The violet dot's words while a chat that isn't answering has items to review: ", 2 to review". */
function flagOf(chat: ChatSummary): string | undefined {
  if (chat.answering || chat.itemsToReview === 0) return undefined;
  return `, ${words.toReview(chat.itemsToReview)}`;
}

/** When the chat was last used, after the running dot while it answers. */
function RowTime({
  chat,
  now,
  locale,
}: {
  readonly chat: ChatSummary;
  readonly now: Date;
  readonly locale: string | undefined;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="sr-only">, </span>
      {chat.answering ? (
        <span className="size-1.5 shrink-0 rounded-full bg-running forced-color-adjust-none forced-colors:bg-[CanvasText]">
          <span className="sr-only">{words.answering}, </span>
        </span>
      ) : null}
      {chatTime(chat.lastUsedAt, now, locale)}
    </span>
  );
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
