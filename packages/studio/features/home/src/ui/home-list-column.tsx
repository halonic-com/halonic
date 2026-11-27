import { type AiChats, AiChatsService } from "@halonicjs/studio-feature-assistant/api";
import { Button, List, PlusIcon } from "@halonicjs/studio-kit";
import type { HomeListColumnProps, WorkspaceContext } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
import { homeWords } from "../home-words.ts";
import { keptOpenChat, type ListedChat } from "../open-chat.ts";

/**
 * Home's list column (`home.list-column`): "New chat" first, then the folder's AI chats, newest
 * message first, or "No chats yet." when there are none. A picked chat opens in the content pane.
 * Without the Assistant the column is empty, and the pane shows Home's sections.
 */
export function HomeListColumn({ context, open, setOpen }: HomeListColumnProps) {
  const chats = context.services.find(AiChatsService);
  const listed = useListedChats(chats, context, open, setOpen);
  if (chats === undefined) return null;
  const openChat = (chatId: string) => {
    chats.open(chatId, context);
    setOpen(chatId);
  };
  const newChat = async () => {
    try {
      openChat(await chats.newChat(context));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      context.announcer.announce(`${homeWords.newChatFailed} ${reason}`, "assertive");
    }
  };
  return (
    <nav aria-label={homeWords.title} className="flex w-80 shrink-0 flex-col gap-2 py-2">
      <Button variant="ghost" icon={<PlusIcon />} onClick={() => void newChat()}>
        {homeWords.newChat}
      </Button>
      <ChatList chats={listed} open={open} onOpen={openChat} />
    </nav>
  );
}

/** The AI chats under "New chat", or "No chats yet." when there are none; nothing while they load. */
function ChatList({
  chats,
  open,
  onOpen,
}: {
  readonly chats: readonly ListedChat[] | undefined;
  readonly open: string | undefined;
  readonly onOpen: (chatId: string) => void;
}) {
  if (chats === undefined) return null;
  if (chats.length === 0) {
    return <p className="px-3 text-small text-fg-muted">{homeWords.noChats}</p>;
  }
  return (
    <List
      plain
      label={homeWords.chats}
      rows={chats.map((chat) => ({ id: chat.id, title: chat.title }))}
      {...(open === undefined ? {} : { current: open })}
      onOpen={onOpen}
    />
  );
}

/**
 * The AI chats, read again after each change. A chat that leaves the list closes in the pane
 * (`keptOpenChat`). A failed read keeps what the list showed and says why.
 */
function useListedChats(
  chats: AiChats | undefined,
  context: WorkspaceContext,
  open: string | undefined,
  setOpen: (id: string | undefined) => void,
): readonly ListedChat[] | undefined {
  const [listed, setListed] = useState<readonly ListedChat[] | undefined>(undefined);
  const latest = useRef({ listed, open, setOpen });
  latest.current = { listed, open, setOpen };
  useEffect(() => {
    if (chats === undefined) return;
    let current = true;
    const take = (next: readonly ListedChat[]) => {
      if (!current) return;
      const { listed: before, open: shown, setOpen: show } = latest.current;
      latest.current = { ...latest.current, listed: next };
      setListed(next);
      const kept = keptOpenChat(shown, before, next);
      if (kept !== shown) show(kept);
    };
    const fail = (reason: string) => {
      if (current) context.announcer.announce(reason, "assertive");
    };
    const read = () => void readChats(chats, context, take, fail);
    read();
    const stop = chats.subscribe(context, read);
    return () => {
      current = false;
      stop();
    };
  }, [chats, context]);
  return listed;
}

/** Reads the chats once, handing them to `take`, or the reason they couldn't be read to `fail`. */
async function readChats(
  chats: AiChats,
  context: WorkspaceContext,
  take: (next: readonly ListedChat[]) => void,
  fail: (reason: string) => void,
): Promise<void> {
  try {
    take(await chats.list(context));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
