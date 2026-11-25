import { Button, EmptyState, SparkIcon } from "@halonicjs/studio-kit";
import { ItemPage, type ItemPageHandle, type ItemViewProps } from "@halonicjs/studio-shell";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AssistantHostService, type ChatKind } from "../api.ts";
import { buildChatWords as words } from "../chat/build-chat-words.ts";
import { type Announce, type BuildChats, buildChatsOf, type Shown } from "../chat/build-chats.ts";
import { chatMenuWords } from "../chat/chat-menu-words.ts";
import { chatTabItem } from "../chat/chat-tab-item.ts";
import { ChatBody } from "../panel/assistant-panel.tsx";
import { useChatChoices } from "../panel/chat-choices.tsx";
import { DeleteChatDialog } from "../panel/chat-header.tsx";
import { ShownItems } from "../panel/shown-items.tsx";
import { SkillLink } from "../panel/skill-link.tsx";

/**
 * A chat open as a tab (flow-assistant 2.3, `assistant.chat.open-as-tab`): the chat on the left,
 * on the start screen while it's empty, and on the right the side panel with the items the chat
 * shows or changes, closed until it shows one (H6). The header has the ✦ icon, "CHAT", the title
 * as its rename field, ⋮ with Delete chat…, and **Continue in the side panel**, which moves the
 * chat back to the panel and closes the tab. The tab holds its chat while it is open, so the panel
 * never shows the same chat.
 */
export function ChatTabPage({ item, context }: ItemViewProps) {
  const chatId = item.id;
  const host = context.services.get(AssistantHostService);
  const chats = buildChatsOf(host);
  const [shown, retry] = useTabChat(chats, chatId);
  const choices = useChatChoices(host, chatId);
  // Chat with starts a new chat of that kind; this chat stays in its tab, the new one gets its own.
  // A chat that can't be started is announced, like the panel's other failed actions.
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
  const box = useRef<HTMLTextAreaElement>(null);
  const page = useRef<ItemPageHandle<"items">>(null);
  const [deleting, setDeleting] = useState(false);
  const announce = useCallback<Announce>(
    (text, politeness) => context.announcer.announce(text, politeness),
    [context],
  );
  // Focus goes into the box as the tab opens (flow-assistant 6.2), once the chat is read.
  const loaded = view !== undefined;
  useEffect(() => {
    if (loaded) box.current?.focus();
  }, [loaded]);
  useSidePanelOnFirstItem(view?.shown.length ?? 0, page);

  const continueInPanel = () => {
    chats.moveToPanel(chatId);
    context.panelWindow?.show();
  };
  const chat = view?.chat;
  return (
    <>
      <ItemPage<"items">
        icon={<SparkIcon />}
        kind={words.chatKind}
        name={chat === undefined || chat.draft ? words.newChat : chat.title}
        onRename={(title) => void chats.rename(chatId, title).catch(() => {})}
        actions={
          chat === undefined || chat.draft
            ? []
            : [{ id: "delete", label: chatMenuWords.deleteChat, onSelect: () => setDeleting(true) }]
        }
        views={[{ id: "items", label: words.items }]}
        handle={page}
        end={
          <Button variant="ghost" size="sm" onClick={continueInPanel}>
            {words.continueInPanel}
          </Button>
        }
        chat={{
          startsOpen: true,
          panelStartsClosed: true,
          render: () => (
            <ChatBody
              context={context}
              shown={shown}
              chats={chats}
              box={box}
              announce={announce}
              onNewChat={() => {}}
              newChatButton={{ current: null }}
              lookingAt={undefined}
              skillLink={(each) => (
                <SkillLink host={host} context={context} freshness={each.messages} />
              )}
              onOpenItem={(each) => context.openItem?.(each)}
              startScreen
              onRetry={retry}
              choices={choices}
              onChatWith={(kind) => void chatWith(kind)}
            />
          ),
        }}
      >
        {() =>
          view === undefined || view.shown.length === 0 ? (
            <div className="px-4 py-3">
              <EmptyState plain title={words.noItems} description={words.noItemsHint} />
            </div>
          ) : (
            <ShownItems
              shown={view.shown}
              onOpen={(each) => context.openItem?.(each)}
              onRemove={(each) => chats.removeShown(chatId, each)}
            />
          )
        }
      </ItemPage>
      {deleting && chat !== undefined ? (
        <DeleteChatDialog
          chats={chats}
          chat={chat}
          onClose={() => setDeleting(false)}
          afterDelete={() => null}
        />
      ) : null}
    </>
  );
}

/**
 * The tab's chat: it moves into the tab as the tab opens (also when Ctrl Shift T brings the tab
 * back), then shows as it's read, or why it couldn't be, with Try again.
 */
function useTabChat(chats: BuildChats, chatId: string): readonly [Shown, () => void] {
  const view = useSyncExternalStore(chats.subscribe, () => chats.viewOf(chatId));
  const [failed, setFailed] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!chats.inTab(chatId)) chats.moveToTab(chatId);
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

/**
 * Opens the side panel by itself with the first item the chat shows or changes, leaving focus
 * where it is (flow-assistant 2.3, from the mockups 5.3).
 */
function useSidePanelOnFirstItem(
  items: number,
  page: RefObject<ItemPageHandle<"items"> | null>,
): void {
  const had = useRef(items > 0);
  useEffect(() => {
    if (items > 0 && !had.current) {
      const focused = document.activeElement;
      page.current?.show("items", () => (focused instanceof HTMLElement ? focused : null));
    }
    had.current = items > 0;
  }, [items, page]);
}
