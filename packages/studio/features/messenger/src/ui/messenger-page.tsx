import type { MessagingId } from "@halonicjs/ports";
import { Button, useNarrow, useToastStore } from "@halonicjs/studio-kit";
import { listColumnClass } from "@halonicjs/studio-kit/list-column";
import type { ChatOpens } from "@halonicjs/studio-services";
import {
  connectFrom,
  type EngineWords,
  engineWords,
  engineWordsOf,
  focusedPanelClass,
  NoConnections,
  type PlaceViewProps,
} from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChatOpensService, MessengerService } from "../api.ts";
import { type ChatPins, type PinnedChat, pinnedFirst } from "../chat-pins.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { WithActivity } from "./activity-host.tsx";
import { type AgentPictures, pictureOfAgent, useAgentPictures } from "./agent-pictures.ts";
import { ChatsColumn, useChats } from "./chats-column.tsx";
import { ConversationView } from "./conversation-view.tsx";
import { useFadeIn } from "./load-states.tsx";
import { NeedsYouPanel, useWaiting } from "./needs-you.tsx";
import { NewMenu } from "./new-menu.tsx";
import { useChatOpens } from "./use-chat-opens.ts";
import { type ChatPinning, ChatPinsProvider, useChatPinning } from "./use-chat-pins.tsx";
import { useLeft } from "./use-left.ts";
import { useShownChat } from "./use-shown-chat.ts";

/** The props of {@link MessengerPage}. */
export interface MessengerPageProps {
  readonly messenger: Messenger;
  /** The pinned chats; kept on this device by default (`messenger.pinned-chats`). */
  readonly pins?: ChatPins | undefined;
  /** Opens Settings › Connections; without it, the page with nothing connected has no button. */
  readonly onConnect?: () => void;
  /** How a failed read says the engine isn't answering, worded for where the Studio runs. */
  readonly words?: EngineWords;
  /** The chats quick ask's box hands over, each opened with the focus in its box. */
  readonly opens?: ChatOpens | undefined;
}

/**
 * The Messenger in the new design (HAL-20730): the list column on the left and the open
 * conversation in the content pane beside it, past a 1px line, both on the panel colour
 * (`messenger.framed-list`, `kit.list-column`). It reads the list when it opens and whenever a
 * source says it changed.
 *
 * A window narrower than 900px (`useNarrow`, such as 320px or 400 % zoom) shows one pane at a
 * time, as the Inbox does: the list, or the open chat with **Back to chats**, which puts focus
 * back on the chat's row. Opening a chat there puts focus in
 * its box (HAL-18074 MS5).
 *
 * With nothing connected, the panel says so and offers Connect Paperclip, instead
 * of an empty list that looks like a Paperclip with no chats.
 *
 * Leaving a channel says so in the page's status region and puts focus on the row that took its
 * place in the list (`useLeft`, HAL-18835).
 *
 * A chat quick ask's box hands over opens with the focus in its box (`useChatOpens`, HAL-19097).
 */
export function MessengerPage({
  messenger,
  onConnect,
  words = engineWords["desktop-app"],
  opens,
  pins,
}: MessengerPageProps) {
  const { rows, connected, failure, changed, readAgain } = useChats(messenger);
  const [selected, setSelected] = useState<MessagingId | undefined>(undefined);
  // The "Needs you" panel shows in the chat's place (`messenger.needs-you`).
  const [needsYou, setNeedsYou] = useState(false);

  const pictures = useAgentPictures(messenger, rows ?? []);
  const open = rows?.find((row) => row.conversation.id === selected);
  const onePaneState = useOnePane(selected, setSelected);
  const { onePane, list, chat } = onePaneState;
  const select = (conversation: MessagingId) => {
    messenger.shown.choose();
    setNeedsYou(false);
    onePaneState.select(conversation);
  };
  const back = () => {
    setNeedsYou(false);
    onePaneState.back();
  };
  const openNeedsYou = () => {
    messenger.shown.choose();
    setSelected(undefined);
    setNeedsYou(true);
  };
  useFadeIn(chat, needsYou ? "needs-you" : open?.conversation.id);
  // A chat handed over or picked here wins over the chat the window kept (`messenger.window-chat`).
  useChatOpens(
    opens,
    (conversation) => {
      messenger.shown.choose();
      setNeedsYou(false);
      setSelected(conversation);
    },
    open?.conversation.id,
    chat,
  );
  useShownChat(messenger, open?.conversation.id, (conversation) => {
    setNeedsYou(false);
    setSelected(conversation);
  });
  const waiting = useWaiting(messenger, rows);
  // In one pane, nothing connected shows the panel, so a narrow window still offers Connect.
  const panelFirst = open !== undefined || needsYou || connected === false;
  // A channel made or joined is read into the list, then opened.
  const openChannel = (channel: MessagingId) => {
    readAgain();
    select(channel);
  };
  const pinning = useChatPinning(pins, rows);
  const toasted = usePinsFullToast(pinning.fullCount, onePane && panelFirst);
  // Leaving finds the row that takes the channel's place in the order the list shows it.
  const { said, leave } = useLeft(list, shownOrder(rows, pinning.pinned));
  const left = () => {
    if (open !== undefined) leave(open);
    setSelected(undefined);
    readAgain();
  };
  // An open chat reads its messages, so marking it unread closes it, as Mail does, and focus goes
  // back to its row, now with its count (`messenger.read-marks`).
  const markUnread = () => {
    if (open !== undefined) messenger.markUnread(open);
    back();
  };
  return (
    <ChatPinsProvider value={pinning}>
      <div className={pageClass}>
        {/* The page's heading and status come first, so they read before the list, and stay while
          one pane shows the chat; both are out of the flow, so they take no room. */}
        <h1 className="sr-only">{messengerWords.title}</h1>
        <PageStatus
          said={said}
          pinning={pinning}
          silent={onePane && panelFirst}
          toasted={toasted}
        />
        {onePane && panelFirst ? null : (
          <ListColumn listRef={list} onePane={onePane} connected={connected}>
            <ChatsColumn
              messenger={messenger}
              rows={rows}
              connected={connected}
              failure={failure}
              words={words}
              onRetry={readAgain}
              selected={selected}
              onSelect={select}
              pictures={pictures}
              waiting={waiting?.waiting}
              needsYou={needsYou}
              onNeedsYou={openNeedsYou}
              newMenu={<NewMenu messenger={messenger} onOpen={openChannel} />}
            />
          </ListColumn>
        )}

        {onePane && !panelFirst ? null : (
          <WithActivity messenger={messenger} row={open} words={words}>
            <main ref={chat} data-part="content-pane" className={contentPaneClass}>
              {onePane && (open !== undefined || needsYou) ? (
                <div className="px-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={back}>
                    {messengerWords.backToChats}
                  </Button>
                </div>
              ) : null}
              {needsYou ? (
                <NeedsYouPanel
                  messenger={messenger}
                  read={waiting}
                  pictureOf={(agent) => pictureOfAgent(pictures, rows ?? [], agent)}
                  onOpenChat={select}
                  onAnswered={readAgain}
                />
              ) : (
                <Panel
                  messenger={messenger}
                  loaded={rows !== undefined}
                  words={words}
                  connected={connected}
                  open={open}
                  changed={changed}
                  pictures={pictures}
                  onConnect={onConnect}
                  onLeft={left}
                  onChanged={readAgain}
                  onMarkUnread={markUnread}
                />
              )}
            </main>
          </WithActivity>
        )}
      </div>
    </ChatPinsProvider>
  );
}

/**
 * The page's status region: what Leave said, "Chat pinned." or "Chat unpinned." after the ··· menu
 * (focus goes back to ···, so nothing else says it), and "You can pin up to 3 chats." on every pin that
 * finds them all taken, except a pin whose toast said it (one pane), even once the list is back.
 */
function PageStatus({
  said,
  pinning,
  silent,
  toasted,
}: {
  readonly said: { readonly text: string; readonly count: number };
  readonly pinning: ChatPinning;
  /** One pane shows the chat, so a toast says it. */
  readonly silent: boolean;
  /** The last full pin a toast said. */
  readonly toasted: number;
}) {
  const sayPinsFull = pinning.full && !silent && pinning.fullCount !== toasted;
  return (
    // Not atomic: the region keeps earlier lines, so only the newly keyed line is read.
    <p role="status" aria-atomic="false" className="sr-only" data-page-status>
      <span key={said.count}>{said.text}</span>
      <span key={`pin-${pinning.doneCount}`}>{pinWords(pinning.done)}</span>
      <span key={`pins-${pinning.fullCount}`}>{sayPinsFull ? messengerWords.pinsFull : ""}</span>
    </p>
  );
}

/** What the page's status says after a pin or unpin worked. */
function pinWords(done: ChatPinning["done"]): string {
  if (done === "pinned") return messengerWords.chatPinned;
  if (done === "unpinned") return messengerWords.chatUnpinned;
  return "";
}

/**
 * While one pane shows the chat, the list's "You can pin up to 3 chats." isn't on screen, so a
 * pin that finds them all taken says it in a toast instead (Noah's look check on HAL-21047),
 * closing the last one first so two never stack. Gives the full pin the last toast said.
 */
function usePinsFullToast(fullCount: number, listHidden: boolean): number {
  const toasts = useToastStore();
  const seen = useRef(fullCount);
  const open = useRef<string | undefined>(undefined);
  const [toasted, setToasted] = useState(0);
  useEffect(() => {
    if (fullCount === seen.current) return;
    seen.current = fullCount;
    if (!listHidden || toasts === undefined || toasts === null) return;
    if (open.current !== undefined) toasts.close(open.current);
    open.current = toasts.show({ tone: "info", title: messengerWords.pinsFull });
    setToasted(fullCount);
  }, [fullCount, listHidden, toasts]);
  return toasted;
}

/** The rows in the order the list shows them: the pinned ones first (`messenger.pinned-chats`). */
function shownOrder(
  rows: readonly ConversationRow[] | undefined,
  pinned: readonly PinnedChat[],
): readonly ConversationRow[] | undefined {
  if (rows === undefined) return undefined;
  const split = pinnedFirst(rows, pinned);
  return [...split.pinned, ...split.others];
}

/**
 * The list column beside the chat in the new design (`messenger.framed-list`): the kit's one
 * list-column size (`kit.list-column`), past a 1px line from the chat.
 */
const desktopListColumnClass = `${listColumnClass} flex shrink-0 flex-col border-e border-border`;

/**
 * The page: the window's one framed panel, rounded corners and a 1px line on the frame, that holds
 * the list column and the chat (`messenger.framed-list`, `shell.focused-apps`).
 */
const pageClass = `flex h-full min-h-0 min-w-0 flex-1 ${focusedPanelClass}`;

/** The content pane that holds the open chat: the rest of the width, on the panel colour. */
const contentPaneClass = "flex min-h-0 min-w-0 flex-1 flex-col bg-app-panel";

/**
 * The list's column, the page's Messenger landmark. With nothing connected the panel's No
 * connections is the one message, never an empty landmark (HAL-18316 MS12): the column is left
 * out, so the message centres in the one panel (`messenger.framed-list`). One pane at a time
 * shows the panel instead of the list then, so this runs only side by side.
 */
function ListColumn({
  listRef,
  onePane,
  connected,
  children,
}: {
  readonly listRef: RefObject<HTMLElement | null>;
  readonly onePane: boolean;
  readonly connected: boolean | undefined;
  readonly children: ReactNode;
}) {
  const className = onePane ? "flex min-w-0 flex-1 flex-col" : desktopListColumnClass;
  if (connected === false) return null;
  return (
    <nav
      ref={listRef}
      aria-label={messengerWords.title}
      data-part="list-column"
      className={className}
    >
      {children}
    </nav>
  );
}

/** The panel: nothing connected, no chat picked yet, or the open chat. */
function Panel({
  messenger,
  loaded,
  words,
  connected,
  open,
  changed,
  pictures,
  onConnect,
  onLeft,
  onChanged,
  onMarkUnread,
}: {
  readonly messenger: Messenger;
  readonly loaded: boolean;
  readonly words: EngineWords;
  readonly connected: boolean | undefined;
  readonly open: ConversationRow | undefined;
  readonly changed: number;
  readonly pictures: AgentPictures;
  readonly onConnect: (() => void) | undefined;
  readonly onLeft: () => void;
  readonly onChanged: () => void;
  readonly onMarkUnread: () => void;
}) {
  if (connected === false) {
    return <NoConnections line={messengerWords.noConnections.line} onConnect={onConnect} />;
  }
  // While the chats load, or failed to, the list's column says so; the panel stays empty.
  if (!loaded) return null;
  if (open === undefined) {
    return <p className="m-auto text-small text-fg-muted">{messengerWords.pickChat}</p>;
  }
  return (
    <ConversationView
      key={open.conversation.id}
      messenger={messenger}
      row={open}
      changed={changed}
      pictures={pictures}
      words={words}
      onLeft={onLeft}
      onChanged={onChanged}
      onMarkUnread={onMarkUnread}
    />
  );
}

/**
 * Below 900px one pane shows at a time, and the other is gone until it shows again; so focus moves
 * once it has rendered: into the box of the chat a row opened, and back to the row from the chat.
 */
function useOnePane(
  selected: MessagingId | undefined,
  setSelected: (conversation: MessagingId | undefined) => void,
) {
  const onePane = useNarrow();
  const list = useRef<HTMLElement>(null);
  const chat = useRef<HTMLElement>(null);
  const select = (conversation: MessagingId) => {
    if (!onePane) return setSelected(conversation);
    flushSync(() => setSelected(conversation));
    chat.current?.querySelector<HTMLElement>("textarea")?.focus();
  };
  const back = () => {
    flushSync(() => setSelected(undefined));
    // The kit's plain row carries the chat's id; its first button is the row itself.
    const chats = list.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [];
    const row = [...chats].find((each) => each.getAttribute("data-row-id") === selected);
    row?.querySelector<HTMLElement>("button")?.focus();
  };
  return { onePane, list, chat, select, back };
}

/**
 * The Messenger's focused app, Halonic Messenger (`shell.focused-apps`): the open workspace's
 * Messenger, with its list column and the open chat on the window's one framed panel.
 */
export function MessengerWindow({ context }: PlaceViewProps) {
  const onConnect = connectFrom(context);
  return (
    <MessengerPage
      messenger={context.services.get(MessengerService)}
      words={engineWordsOf(context)}
      opens={context.services.find(ChatOpensService)}
      {...(onConnect === undefined ? {} : { onConnect })}
    />
  );
}
