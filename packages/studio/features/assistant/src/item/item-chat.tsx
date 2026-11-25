import type { ItemPageChat, WorkspaceContext } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AssistantHost,
  AssistantHostService,
  type ChatAbout,
  type ItemChat,
  sameAbout,
} from "../api.ts";
import { type Announce, buildChatsOf, type Shown } from "../chat/build-chats.ts";
import { ChatBody } from "../panel/assistant-panel.tsx";
import { useChatChoices } from "../panel/chat-choices.tsx";
import { SkillLink } from "../panel/skill-link.tsx";
import { useTabChat } from "../tab/chat-tab-page.tsx";

/**
 * The Build chat about one item, for the workflows and library features (`ItemChatService`):
 * the chat on the left of the item's page (flow-assistant 2.1), and the side panel's chat for
 * "Ask about this <kind>…" and for the New workflow dialog's Describe link (flow-workflows 2.2).
 */
export const itemChat: ItemChat = {
  chatFor(about, _name, context): ItemPageChat {
    return {
      startsOpen: true,
      render: () => <ItemPageChatBody about={about} context={context} />,
    };
  },
  async askAbout(about, _name, context) {
    await openInPanel(context, about, undefined);
  },
  async describe(text, context) {
    await openInPanel(context, undefined, text);
  },
};

/**
 * Shows a new Build chat (or the empty draft there is) in the side panel, opening a closed panel,
 * with focus in its box and `text` in it when given.
 */
async function openInPanel(
  context: WorkspaceContext,
  about: ChatAbout | undefined,
  text: string | undefined,
): Promise<void> {
  const chats = buildChatsOf(context.services.get(AssistantHostService));
  await chats.newChatAsking(about, text);
  const panel = context.panelWindow;
  if (panel !== undefined && !panel.isOpen()) panel.show();
}

/**
 * The chat on the left of an item's page: the item's most recently used chat, else a new draft
 * about it. The page holds it as a chat tab holds its chat, so the panel never shows the same
 * chat. The chat's own words about the item come with the workflow page (flow-assistant 2.4).
 */
function ItemPageChatBody(props: {
  readonly about: ChatAbout;
  readonly context: WorkspaceContext;
}) {
  const { about, context } = props;
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
  if (chatId !== undefined) return <HeldChat context={context} chatId={chatId} />;
  const shown: Shown =
    failed === undefined ? { kind: "loading" } : { kind: "failed", reason: failed };
  return (
    <ChatOnPage context={context} shown={shown} onRetry={() => setAttempt((count) => count + 1)} />
  );
}

/** The kept Build chat about `about` used most recently, else a new draft about it. */
async function chatAbout(host: AssistantHost, about: ChatAbout): Promise<string> {
  const kept = (await host.chats()).find(
    (chat) => chat.kind === "build" && sameAbout(chat.about, about),
  );
  return kept?.id ?? (await host.newChat("build", about)).id;
}

/** The item's chat once it is known, held by the page. */
function HeldChat(props: { readonly context: WorkspaceContext; readonly chatId: string }) {
  const chats = buildChatsOf(props.context.services.get(AssistantHostService));
  const [shown, retry] = useTabChat(chats, props.chatId);
  return <ChatOnPage context={props.context} shown={shown} onRetry={retry} />;
}

/** The Assistant's chat body, as a chat tab draws it, on the left of the page. */
function ChatOnPage(props: {
  readonly context: WorkspaceContext;
  readonly shown: Shown;
  readonly onRetry: () => void;
}) {
  const { context, shown } = props;
  const host = context.services.get(AssistantHostService);
  const chats = buildChatsOf(host);
  const choices = useChatChoices(host, shown.kind === "chat" ? shown.view.chat.id : undefined);
  const box = useRef<HTMLTextAreaElement>(null);
  const announce = useCallback<Announce>(
    (text, politeness) => context.announcer.announce(text, politeness),
    [context],
  );
  return (
    <ChatBody
      context={context}
      shown={shown}
      chats={chats}
      box={box}
      announce={announce}
      onNewChat={() => {}}
      newChatButton={{ current: null }}
      lookingAt={undefined}
      skillLink={(view) => <SkillLink host={host} context={context} freshness={view.messages} />}
      onOpenItem={(item) => context.openItem?.(item)}
      onRetry={props.onRetry}
      // A chat about an item stays a Build chat: Chat with offers no agents here.
      choices={{ ...choices, agents: [] }}
      onChatWith={() => {}}
    />
  );
}
