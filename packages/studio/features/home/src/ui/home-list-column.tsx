import { type AiChats, AiChatsService } from "@halonicjs/studio-feature-assistant/api";
import { Button, List, PlusIcon, useToastStore } from "@halonicjs/studio-kit";
import {
  errorReasonFor,
  type HomeListColumnProps,
  useRefocusWhenGone,
  useTellWhenGoneWithFocus,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
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
  const { listed, failure, retrying, retry } = useListedChats(chats, context, open, setOpen);
  const newChatButton = useRef<HTMLButtonElement>(null);
  // Try again goes once a read works, whichever read it was. If it held the focus and the focus
  // fell to the page with it, the focus moves to New chat; anyone elsewhere keeps their place.
  const tryAgainGone = useRefocusWhenGone(() => newChatButton.current?.focus());
  if (chats === undefined) return null;
  const newChat = async () => {
    try {
      setOpen(await chats.newChat(context));
    } catch (error) {
      const reason = errorReasonFor(error);
      // A danger toast is an alert, which a screen reader reads; announcing it too says it twice.
      if (toasts === null) {
        context.announcer.announce(`${homeWords.newChatFailed} ${reason}`, "assertive");
      } else {
        toasts.show({ tone: "danger", title: homeWords.newChatFailed, text: reason });
      }
    }
  };
  return (
    <nav aria-label={homeWords.title} className="flex min-w-0 flex-col gap-2 py-2">
      <Button
        ref={newChatButton}
        variant="ghost"
        icon={<PlusIcon />}
        onClick={() => void newChat()}
      >
        {homeWords.newChat}
      </Button>
      {failure !== undefined && (
        <FailureLine
          reason={failure.reason}
          retrying={retrying}
          onTryAgain={retry}
          onGoneWithFocus={tryAgainGone}
        />
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

/** Why the chats couldn't be read, with Try again; tells `onGoneWithFocus` if it goes with the focus. */
function FailureLine({
  reason,
  retrying,
  onTryAgain,
  onGoneWithFocus,
}: {
  readonly reason: string;
  readonly retrying: boolean;
  readonly onTryAgain: () => void;
  readonly onGoneWithFocus: () => void;
}) {
  const tryAgain = useRef<HTMLButtonElement>(null);
  useTellWhenGoneWithFocus(tryAgain, onGoneWithFocus);
  return (
    // Try again gets a row of its own, and its side padding hangs out to the left as a chat row's
    // fill does, so its label starts where the reason text starts (HAL-20925). The pull matches
    // the kit's ghost button padding: 12px, 16px on a phone or touch screen.
    <p className="flex flex-col items-start gap-1 px-3 text-small text-fg-muted">
      <span>{`${homeWords.chatsFailed} ${reason}`}</span>
      <span className="-ms-3 phone:-ms-4 touch:-ms-4">
        <Button
          ref={tryAgain}
          variant="ghost"
          busy={retrying}
          busyLabel={homeWords.tryingAgain}
          onClick={onTryAgain}
        >
          {homeWords.tryAgain}
        </Button>
      </span>
    </p>
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
 * hands back its reason as `failure` until a read works; `retry` reads again, with `retrying` true
 * until that read is done. Each failure is a new object, so the same reason twice still changes
 * it. The subscription keys on the service only: the context is a new object on each window draw,
 * so it is read through `latest`.
 */
function useListedChats(
  chats: AiChats | undefined,
  context: WorkspaceContext,
  open: string | undefined,
  setOpen: (id: string | undefined) => void,
): {
  readonly listed: readonly ListedChat[] | undefined;
  readonly failure: { readonly reason: string } | undefined;
  readonly retrying: boolean;
  readonly retry: () => void;
} {
  const [listed, setListed] = useState<readonly ListedChat[] | undefined>(undefined);
  const [failure, setFailure] = useState<{ readonly reason: string } | undefined>(undefined);
  const [retrying, setRetrying] = useState(false);
  const readAgain = useRef<() => Promise<void>>(async () => {});
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
      setFailure({ reason });
      latest.current.context.announcer.announce(`${homeWords.chatsFailed} ${reason}`, "assertive");
    };
    const read = () => readChats(chats, latest.current.context, take, fail);
    readAgain.current = read;
    void read();
    const stop = chats.subscribe(latest.current.context, () => void read());
    return () => {
      current = false;
      stop();
    };
  }, [chats]);
  const retry = useCallback(() => {
    setRetrying(true);
    void readAgain.current().finally(() => setRetrying(false));
  }, []);
  return { listed, failure, retrying, retry };
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
    fail(errorReasonFor(error));
  }
}
