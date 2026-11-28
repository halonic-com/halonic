import { type AiChats, AiChatsService } from "@halonicjs/studio-feature-assistant/api";
import { Button, List, PlusIcon, useToastStore } from "@halonicjs/studio-kit";
import type { HomeListColumnProps, WorkspaceContext } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import { homeWords } from "../home-words.ts";
import { keptOpenChat, type ListedChat } from "../open-chat.ts";

/**
 * Home's list column (`home.list-column`): "New chat" first, then the folder's AI chats, newest
 * message first, or "No chats yet." when there are none. A picked chat opens in the content pane;
 * a Ctrl-click, Cmd-click or middle click opens it as its tab. The shell sets the column's width.
 * Without the Assistant the column is empty, and the pane shows Home's sections. A failed read
 * shows its reason and "Try again" under "New chat", above the list it last showed; a failed
 * "New chat" shows a danger toast, as the other features do.
 */
export function HomeListColumn({ context, open, setOpen }: HomeListColumnProps) {
  const chats = context.services.find(AiChatsService);
  const toasts = useToastStore();
  const { listed, failure, retry } = useListedChats(chats, context, open, setOpen);
  if (chats === undefined) return null;
  const newChat = async () => {
    try {
      setOpen(await chats.newChat(context));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // A danger toast is an alert, so a screen reader reads it; announcing it too would say it twice.
      if (toasts === null) {
        context.announcer.announce(`${homeWords.newChatFailed} ${reason}`, "assertive");
      } else {
        toasts.show({ tone: "danger", title: homeWords.newChatFailed, text: reason });
      }
    }
  };
  return (
    <nav aria-label={homeWords.title} className="flex min-w-0 flex-col gap-2 py-2">
      <Button variant="ghost" icon={<PlusIcon />} onClick={() => void newChat()}>
        {homeWords.newChat}
      </Button>
      {failure !== undefined && (
        <p className="flex flex-wrap items-center gap-2 px-3 text-small text-fg-muted">
          {`${homeWords.chatsFailed} ${failure}`}
          <Button variant="ghost" onClick={retry}>
            {homeWords.tryAgain}
          </Button>
        </p>
      )}
      <ChatList
        chats={listed}
        open={open}
        onOpen={setOpen}
        onOpenInNewTab={(chatId) => chats.openInTab(chatId, context)}
      />
    </nav>
  );
}

/** The AI chats under "New chat", or "No chats yet." when there are none; nothing while they load. */
function ChatList({
  chats,
  open,
  onOpen,
  onOpenInNewTab,
}: {
  readonly chats: readonly ListedChat[] | undefined;
  readonly open: string | undefined;
  readonly onOpen: (chatId: string) => void;
  readonly onOpenInNewTab: (chatId: string) => void;
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
      onOpenInNewTab={onOpenInNewTab}
    />
  );
}

/**
 * The AI chats, read again after each change to the list. A chat that leaves the list closes in
 * the pane (`keptOpenChat`). A failed read keeps what the list showed, announces what failed and
 * hands back its reason as `failure` until a read works; `retry` reads again. The subscription keys
 * on the service only: the context is a new object on each window draw, so it is read through
 * `latest`.
 */
function useListedChats(
  chats: AiChats | undefined,
  context: WorkspaceContext,
  open: string | undefined,
  setOpen: (id: string | undefined) => void,
): {
  readonly listed: readonly ListedChat[] | undefined;
  readonly failure: string | undefined;
  readonly retry: () => void;
} {
  const [listed, setListed] = useState<readonly ListedChat[] | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const readAgain = useRef<() => void>(() => {});
  const latest = useRef({ listed, open, setOpen, context });
  latest.current = { listed, open, setOpen, context };
  useEffect(() => {
    if (chats === undefined) return;
    let current = true;
    const take = (next: readonly ListedChat[]) => {
      if (!current) return;
      const { listed: before, open: shown, setOpen: show } = latest.current;
      latest.current = { ...latest.current, listed: next };
      setListed(next);
      setFailure(undefined);
      const kept = keptOpenChat(shown, before, next);
      if (kept !== shown) show(kept);
    };
    const fail = (reason: string) => {
      if (!current) return;
      setFailure(reason);
      latest.current.context.announcer.announce(`${homeWords.chatsFailed} ${reason}`, "assertive");
    };
    const read = () => void readChats(chats, latest.current.context, take, fail);
    readAgain.current = read;
    read();
    const stop = chats.subscribe(latest.current.context, read);
    return () => {
      current = false;
      stop();
    };
  }, [chats]);
  const retry = useCallback(() => readAgain.current(), []);
  return { listed, failure, retry };
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
