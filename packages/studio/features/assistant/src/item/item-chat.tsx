import type { ItemPageChat, ServiceLookup, WorkspaceContext } from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  type AssistantHost,
  AssistantHostService,
  type ChatAbout,
  type ItemChat,
  sameAbout,
} from "../api.ts";
import { withAssistantServices } from "../chat/assistant-context.ts";
import { buildChatWords } from "../chat/build-chat-words.ts";
import { type Announce, type BoxAsk, buildChatsOf, type Shown } from "../chat/build-chats.ts";
import { chatTabItem } from "../chat/chat-tab-item.ts";
import { ChatBody } from "../panel/assistant-panel.tsx";
import { useChatChoices } from "../panel/chat-choices.tsx";
import { SkillLink } from "../panel/skill-link.tsx";
import { useTabChat } from "../tab/chat-tab-page.tsx";
import { ItemChatHeader } from "./item-chat-header.tsx";

/**
 * The Build chat about one item, for the workflows and library features (`ItemChatService`):
 * the chat on the left of the item's page (flow-assistant 2.1), and the side panel's chat for
 * "Ask about this <kind>…" and for the New workflow dialog's Describe link (flow-workflows 2.2).
 */
export const itemChat: ItemChat = {
  chatFor(about, name, context): ItemPageChat {
    return {
      startsOpen: true,
      render: () => <ItemPageChatBody about={about} name={name} context={context} />,
    };
  },
  async askAbout(about, name, context, text) {
    // The item-page chat's placeholder, with the item's name in it (HAL-18155, point 4).
    await openInPanel(context, about, { text, placeholder: buildChatWords.itemPlaceholder(name) });
    // The chip under "Shown:" keeps what the chat is about in sight after a tab switch (5.7).
    const chats = buildChatsOf(context.services.get(AssistantHostService));
    await chats.showItem({ item: about, name });
  },
  async describe(text, context) {
    await openInPanel(context, undefined, { text });
  },
};

/**
 * The item chat for another feature's context, reading the host through the Assistant's own
 * `services`: the workflows and library features don't list `AssistantHostService`.
 */
export function itemChatOf(services: ServiceLookup): ItemChat {
  const ours = (context: WorkspaceContext) => withAssistantServices(context, services);
  return {
    chatFor: (about, name, context) => itemChat.chatFor(about, name, ours(context)),
    askAbout: (about, name, context, text) => itemChat.askAbout(about, name, ours(context), text),
    describe: (text, context) => itemChat.describe(text, ours(context)),
  };
}

/**
 * Shows a new Build chat (or the empty draft there is) in the side panel, opening a closed panel,
 * with focus in its box and what `ask` gives in it.
 */
async function openInPanel(
  context: WorkspaceContext,
  about: ChatAbout | undefined,
  ask: BoxAsk,
): Promise<void> {
  const chats = buildChatsOf(context.services.get(AssistantHostService));
  await chats.newChatAsking(about, ask);
  const panel = context.panelWindow;
  if (panel !== undefined && !panel.isOpen()) panel.show();
}

/** The item a chat on its page is about, and its name as the page shows it now. */
interface PageItem {
  readonly about: ChatAbout;
  readonly name: string;
  readonly context: WorkspaceContext;
}

/**
 * The chat on the left of an item's page (flow-assistant 2.4): the item's most recently used
 * chat, else a new draft about it. The page holds it as a chat tab holds its chat, so the panel
 * never shows the same chat. Its menu lists only the chats about the item, and picking one, or
 * New chat, changes the chat the page holds.
 */
function ItemPageChatBody(props: PageItem) {
  const { context } = props;
  const about = useSameAbout(props.about);
  const host = context.services.get(AssistantHostService);
  const [chatId, setChatId] = useState<string>();
  const [failed, setFailed] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  // `attempt` reads the chat again after Try again.
  useEffect(() => {
    let current = true;
    setFailed(undefined);
    chatAbout(host, about).then(
      (id) => current && setChatId(id),
      (error: unknown) => {
        if (current) setFailed(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      current = false;
    };
  }, [host, about, attempt]);
  // The chat box, shared by the header so its focus rules reach it (HAL-18315, AS10).
  const box = useRef<HTMLTextAreaElement>(null);
  const [focusAsked, setFocusAsked] = useState(0);
  // Runs after the chat asked for is drawn, so its box is there to take focus.
  useEffect(() => {
    if (focusAsked > 0) box.current?.focus();
  }, [focusAsked]);
  // Shows a chat with focus in its box, as the panel does (HAL-18315, AS9). The chat is read
  // first, so its menu stays drawn rather than giving way to a plain title while it loads.
  const show = (id: string) => {
    void buildChatsOf(host)
      .read(id)
      .catch(() => {})
      .then(() => {
        setChatId(id);
        setFocusAsked((count) => count + 1);
      });
  };
  // A new chat about the item, or the empty draft about it there is.
  const newChat = () => void host.newChat("build", about).then((chat) => show(chat.id));
  if (chatId !== undefined) {
    return <HeldChat {...props} box={box} chatId={chatId} onPick={show} onNewChat={newChat} />;
  }
  const shown: Shown =
    failed === undefined ? { kind: "loading" } : { kind: "failed", reason: failed };
  return (
    <ChatOnPage
      {...props}
      box={box}
      shown={shown}
      header={null}
      onRetry={() => setAttempt((count) => count + 1)}
    />
  );
}

/**
 * `about` as first given, until it names another item: a page drawn again with a new object for
 * the same item doesn't read its chat again.
 */
function useSameAbout(about: ChatAbout): ChatAbout {
  const kept = useRef(about);
  if (!sameAbout(kept.current, about)) kept.current = about;
  return kept.current;
}

/** The kept Build chat about `about` used most recently, else a new draft about it. */
async function chatAbout(host: AssistantHost, about: ChatAbout): Promise<string> {
  const kept = (await host.chats()).find(
    (chat) => chat.kind === "build" && sameAbout(chat.about, about),
  );
  return kept?.id ?? (await host.newChat("build", about)).id;
}

/** The item's chat once it is known, held by the page, under its menu and ⋮. */
function HeldChat(
  props: PageItem & {
    readonly box: RefObject<HTMLTextAreaElement | null>;
    readonly chatId: string;
    readonly onPick: (chatId: string) => void;
    readonly onNewChat: () => void;
  },
) {
  const { context, about } = props;
  const host = context.services.get(AssistantHostService);
  const chats = buildChatsOf(host);
  const [shown, retry] = useTabChat(chats, props.chatId);
  const view = shown.kind === "chat" ? shown.view : undefined;
  const { openItem } = context;
  const announce = useCallback<Announce>(
    (text, politeness) => context.announcer.announce(text, politeness),
    [context],
  );
  // Open as tab gives the chat its own tab, and the page a new chat about the item: one chat in
  // one place. A draft has nothing to move yet.
  const openAsTab =
    view === undefined || view.chat.draft || openItem === undefined
      ? undefined
      : () => {
          openItem(chatTabItem(view.chat.id));
          props.onNewChat();
        };
  const header = (
    <ItemChatHeader
      host={host}
      chats={chats}
      view={view}
      box={props.box}
      title={buildChatWords.panel}
      onNewChat={props.onNewChat}
      only={(chat) => chat.kind === "build" && sameAbout(chat.about, about)}
      onPick={props.onPick}
      onOpenAsTab={openAsTab}
      announce={announce}
    />
  );
  return <ChatOnPage {...props} shown={shown} header={header} onRetry={retry} />;
}

/** The Assistant's chat body, as a chat tab draws it, on the left of the page. */
function ChatOnPage(
  props: PageItem & {
    readonly box: RefObject<HTMLTextAreaElement | null>;
    readonly shown: Shown;
    readonly header: ReactNode;
    readonly onRetry: () => void;
  },
) {
  const { context, shown } = props;
  const host = context.services.get(AssistantHostService);
  const chats = buildChatsOf(host);
  const choices = useChatChoices(host, shown.kind === "chat" ? shown.view.chat.id : undefined);
  const announce = useCallback<Announce>(
    (text, politeness) => context.announcer.announce(text, politeness),
    [context],
  );
  return (
    <>
      {props.header}
      <ChatBody
        context={context}
        shown={shown}
        chats={chats}
        box={props.box}
        announce={announce}
        onNewChat={() => {}}
        newChatButton={{ current: null }}
        lookingAt={undefined}
        aboutName={props.name}
        skillLink={(view) => <SkillLink host={host} context={context} freshness={view.messages} />}
        onOpenItem={(item) => context.openItem?.(item)}
        onRetry={props.onRetry}
        // A chat about an item stays a Build chat: no Chat with chip (flow-assistant 2.4).
        choices={{ ...choices, agents: [] }}
      />
    </>
  );
}
