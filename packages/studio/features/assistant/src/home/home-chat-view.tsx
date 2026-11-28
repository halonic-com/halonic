import { ContentHeader, IconTile, SparkIcon } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AssistantHostService, type ChatKind } from "../api.ts";
import { buildChatWords as words } from "../chat/build-chat-words.ts";
import { type Announce, type BuildChats, buildChatsOf, type Shown } from "../chat/build-chats.ts";
import { chatTabItem } from "../chat/chat-tab-item.ts";
import { ChatBody } from "../panel/assistant-panel.tsx";
import { useChatChoices } from "../panel/chat-choices.tsx";
import { ChatMoreActions, RenameField } from "../panel/chat-header.tsx";
import { SkillLink } from "../panel/skill-link.tsx";

/** Props for {@link HomeChatView}. */
export interface HomeChatViewProps {
  readonly chatId: string;
  readonly context: WorkspaceContext;
  /** Called when the chat leaves Home: deleted, or shown in the panel or a tab. */
  readonly onLeave: () => void;
}

/**
 * A chat in Home's content pane (`assistant.home.chats`, `assistant.home.chat-look`): the new
 * design's chat header with its title, ⋮ with Rename and Delete chat…, and the chat, without the
 * tab's Continue in the side panel or its items panel. Home holds the chat; when the chat goes
 * anywhere else, `onLeave` tells Home.
 */
export function HomeChatView({ chatId, context, onLeave }: HomeChatViewProps) {
  const host = context.services.get(AssistantHostService);
  const chats = buildChatsOf(host);
  const [shown, retry] = useHomeChat(chats, chatId);
  useLeave(chats, chatId, onLeave);
  const choices = useChatChoices(host, chatId);
  const box = useRef<HTMLTextAreaElement>(null);
  const [renaming, setRenaming] = useState(false);
  const announce = useCallback<Announce>(
    (text, politeness) => context.announcer.announce(text, politeness),
    [context],
  );
  // Chat with starts a chat of that kind, which isn't Home's: it opens as its own tab.
  const chatWith = async (kind: ChatKind) => {
    try {
      const next = await host.newChat(kind);
      chats.moveToTab(next.id);
      context.openItem?.(chatTabItem(next.id));
    } catch (error) {
      announce(error instanceof Error ? error.message : String(error), "assertive");
    }
  };
  const view = shown.kind === "chat" ? shown.view : undefined;
  const title = view === undefined || view.chat.draft ? words.newChat : view.chat.title;
  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-col">
      {renaming && view !== undefined ? (
        // While renaming, the field replaces the whole header, mark and ⋮ included, at its height
        // and shadow; ContentHeader's title is text only. Stacked like it, so bubbles stay under.
        <div className="relative z-(--layer-sticky) flex h-16 shrink-0 items-center bg-surface px-4 shadow-header">
          <RenameField
            chats={chats}
            chatId={chatId}
            title={title}
            onDone={() => setRenaming(false)}
          />
        </div>
      ) : (
        <ContentHeader
          picture={
            <IconTile>
              <SparkIcon />
            </IconTile>
          }
          title={title}
          actions={
            <ChatMoreActions
              chats={chats}
              view={view}
              announce={announce}
              onRename={() => setRenaming(true)}
              afterDelete={() => null}
            />
          }
        />
      )}
      <ChatBody
        context={context}
        shown={shown}
        chats={chats}
        box={box}
        announce={announce}
        onNewChat={() => {}}
        newChatButton={{ current: null }}
        lookingAt={undefined}
        skillLink={(each) => <SkillLink host={host} context={context} freshness={each.messages} />}
        onOpenItem={(each) => context.openItem?.(each)}
        startScreen
        onRetry={retry}
        choices={choices}
        onChatWith={(kind) => void chatWith(kind)}
      />
    </section>
  );
}

/** The chat as it's read, or why it couldn't be, with Try again; Home's pane holds it already. */
function useHomeChat(chats: BuildChats, chatId: string): readonly [Shown, () => void] {
  const view = useSyncExternalStore(chats.subscribe, () => chats.viewOf(chatId));
  const [failed, setFailed] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFailed(undefined);
    chats
      .read(chatId)
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : String(error)));
  }, [chats, chatId, attempt]);
  const retry = () => setAttempt((count) => count + 1);
  if (view !== undefined) return [{ kind: "chat", view }, retry];
  if (failed !== undefined) return [{ kind: "failed", reason: failed }, retry];
  return [{ kind: "loading" }, retry];
}

/** Tells Home when the chat leaves it, with the latest `onLeave`, so a new function each draw is fine. */
function useLeave(chats: BuildChats, chatId: string, onLeave: () => void): void {
  const latest = useRef(onLeave);
  latest.current = onLeave;
  useEffect(() => chats.home.whenLeaves(chatId, () => latest.current()), [chats, chatId]);
}
