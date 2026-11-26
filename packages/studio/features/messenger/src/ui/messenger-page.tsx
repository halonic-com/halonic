import type { MessagingId } from "@halonicjs/ports";
import { Button, useNarrow } from "@halonicjs/studio-kit";
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
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChatOpensService, MessengerService } from "../api.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { WithActivity } from "./activity-host.tsx";
import { type AgentPictures, pictureOf, useAgentPictures } from "./agent-pictures.ts";
import { ChatsColumn, useChats } from "./chats-column.tsx";
import { ConversationView } from "./conversation-view.tsx";
import { useFadeIn } from "./load-states.tsx";
import { NeedsYouPanel, useWaiting } from "./needs-you.tsx";
import { NewMenu } from "./new-menu.tsx";
import { useChatOpens } from "./use-chat-opens.ts";
import { useLeft } from "./use-left.ts";
import { useShownChat } from "./use-shown-chat.ts";

/** The props of {@link MessengerPage}. */
export interface MessengerPageProps {
  readonly messenger: Messenger;
  /** Opens Settings › Connections; without it, the page with nothing connected has no button. */
  readonly onConnect?: () => void;
  /** How a failed read says the engine isn't answering, worded for where the Studio runs. */
  readonly words?: EngineWords;
  /** The chats quick ask's box hands over, each opened with the focus in its box. */
  readonly opens?: ChatOpens | undefined;
}

/**
 * The Messenger (HAL-17421 render 4a): the list on the left, on the frame,
 * and the open conversation as the one panel on the right (`messenger.framed-list`). It reads
 * the list when it opens and whenever a source says it changed.
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
  const { said, leave } = useLeft(list, rows);
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
    <div className="flex h-full min-h-0 gap-2">
      <h1 className="sr-only">{messengerWords.title}</h1>
      <p role="status" className="sr-only" data-page-status>
        <span key={said.count}>{said.text}</span>
      </p>
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
            waiting={waiting}
            needsYou={needsYou}
            onNeedsYou={openNeedsYou}
            newMenu={<NewMenu messenger={messenger} onOpen={openChannel} />}
          />
        </ListColumn>
      )}
      {onePane && !panelFirst ? null : (
        <WithActivity messenger={messenger} row={open} words={words}>
          <main ref={chat} className={`flex min-w-0 flex-1 flex-col ${focusedPanelClass}`}>
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
                waiting={waiting}
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
  );
}

/**
 * The list's column, the page's Messenger landmark. With nothing connected the panel's No
 * connections is the one message: the column stays, so the layout doesn't move once a source
 * connects, but as a plain empty `div`, not an empty landmark (HAL-18316 MS12).
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
  const className = onePane ? "flex min-w-0 flex-1 flex-col" : "flex w-80 shrink-0 flex-col";
  if (connected === false) return <div className={className} />;
  return (
    <nav ref={listRef} aria-label={messengerWords.title} className={className}>
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
      picture={pictureOf(pictures, open)}
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
 * Messenger, with its list on the window's frame and the open chat as the one panel.
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
