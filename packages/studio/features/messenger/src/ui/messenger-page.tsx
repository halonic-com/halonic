import type { MessagingId } from "@halonicjs/ports";
import { Button, EmptyState, useNarrow } from "@halonicjs/studio-kit";
import { focusedPanelClass, type PlaceViewProps } from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MessengerService } from "../api.ts";
import { type ConversationRow, inTab, type Messenger, type MessengerTab } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { ConversationList } from "./conversation-list.tsx";
import { ConversationView } from "./conversation-view.tsx";

/** The props of {@link MessengerPage}. */
export interface MessengerPageProps {
  readonly messenger: Messenger;
  /** Opens Settings › Connections; without it, the page with nothing connected has no button. */
  readonly onConnect?: () => void;
}

/**
 * The Messenger (HAL-17421 render 4a): the list on the left, on the frame,
 * and the open conversation as the one panel on the right. It reads the list
 * when it opens and whenever a source says it changed. The open conversation
 * stays open when it leaves the tab, as when the person answers it.
 *
 * A window narrower than 900px (`useNarrow`, such as 320px or 400 % zoom) shows one pane at a
 * time, as the Inbox does: the list, or the open chat with **Back to chats**, which puts focus
 * back on the chat's row, or on the tab when the chat left it. Opening a chat there puts focus in
 * its box (HAL-18074 MS5).
 *
 * With nothing connected, the panel says so and offers Connect Paperclip, instead
 * of an empty list that looks like a Paperclip with no chats.
 */
export function MessengerPage({ messenger, onConnect }: MessengerPageProps) {
  const [tab, setTab] = useState<MessengerTab>("all");
  const [rows, setRows] = useState<readonly ConversationRow[]>([]);
  // Unknown until the first read lands, so the page never flashes "No connections".
  const [connected, setConnected] = useState<boolean | undefined>(undefined);
  const [selected, setSelected] = useState<MessagingId | undefined>(undefined);
  // Grows on each change a source reports, so the list and the open conversation read again.
  const [changed, setChanged] = useState(0);

  useEffect(() => messenger.watch(() => setChanged((count) => count + 1)), [messenger]);

  useEffect(() => {
    let current = true;
    Promise.all([messenger.rows(), messenger.hasSources()]).then(
      ([read, hasSources]) => {
        if (!current) return;
        setRows(read);
        setConnected(hasSources);
      },
      (error: unknown) => console.error("The Messenger couldn't read its chats:", error),
    );
    return () => {
      current = false;
    };
  }, [messenger, changed]);

  const open = rows.find((row) => row.conversation.id === selected);
  const { onePane, list, chat, select, back } = useOnePane(selected, setSelected);
  // In one pane, nothing connected shows the panel, so a narrow window still offers Connect.
  const panelFirst = open !== undefined || connected === false;
  return (
    <div className="flex h-full min-h-0 gap-2">
      <h1 className="sr-only">{messengerWords.title}</h1>
      {onePane && panelFirst ? null : (
        <ListColumn listRef={list} onePane={onePane} connected={connected}>
          <ConversationList
            tab={tab}
            onTab={setTab}
            rows={inTab(rows, tab)}
            selected={selected}
            onSelect={select}
          />
        </ListColumn>
      )}
      {onePane && !panelFirst ? null : (
        <main ref={chat} className={`flex min-w-0 flex-1 flex-col ${focusedPanelClass}`}>
          {onePane && open !== undefined ? (
            <div className="px-2 pt-2">
              <Button variant="ghost" size="sm" onClick={back}>
                {messengerWords.backToChats}
              </Button>
            </div>
          ) : null}
          <Panel
            messenger={messenger}
            connected={connected}
            open={open}
            changed={changed}
            onConnect={onConnect}
          />
        </main>
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
  connected,
  open,
  changed,
  onConnect,
}: {
  readonly messenger: Messenger;
  readonly connected: boolean | undefined;
  readonly open: ConversationRow | undefined;
  readonly changed: number;
  readonly onConnect: (() => void) | undefined;
}) {
  if (connected === false) return <NoConnections onConnect={onConnect} />;
  if (open === undefined) {
    return <p className="m-auto text-small text-fg-muted">{messengerWords.pickChat}</p>;
  }
  return (
    <ConversationView
      key={open.conversation.id}
      messenger={messenger}
      row={open}
      changed={changed}
    />
  );
}

function NoConnections({ onConnect }: { readonly onConnect: (() => void) | undefined }) {
  const words = messengerWords.noConnections;
  return (
    <div className="m-auto max-w-md">
      <EmptyState
        title={words.title}
        description={words.line}
        {...(onConnect === undefined
          ? {}
          : { action: { label: words.connect, onClick: onConnect } })}
      />
    </div>
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
    const chats = list.current?.querySelectorAll<HTMLElement>("[data-chat]") ?? [];
    const row = [...chats].find((each) => each.getAttribute("data-chat") === selected);
    // An answered chat can leave Waiting for me while it stays open: then its tab takes focus
    // (HAL-18316 MS6).
    (
      row ?? list.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    )?.focus();
  };
  return { onePane, list, chat, select, back };
}

/**
 * The Messenger's focused app, Halonic Messenger (`shell.focused-apps`): the open workspace's
 * Messenger, with its list on the window's frame and the open chat as the one panel.
 */
export function MessengerWindow({ context }: PlaceViewProps) {
  const { openSettings } = context;
  return (
    <MessengerPage
      messenger={context.services.get(MessengerService)}
      {...(openSettings === undefined ? {} : { onConnect: () => openSettings("connections") })}
    />
  );
}
