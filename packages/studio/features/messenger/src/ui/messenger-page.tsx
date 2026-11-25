import type { MessagingId } from "@halonicjs/ports";
import { Button, useNarrow } from "@halonicjs/studio-kit";
import { focusedPanelClass, type PlaceViewProps } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MessengerService } from "../api.ts";
import { type ConversationRow, inTab, type Messenger, type MessengerTab } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { ConversationList } from "./conversation-list.tsx";
import { ConversationView } from "./conversation-view.tsx";

/** The props of {@link MessengerPage}. */
export interface MessengerPageProps {
  readonly messenger: Messenger;
}

/**
 * The Messenger (HAL-17421 render 4a): the list on the left, on the frame,
 * and the open conversation as the one panel on the right. It reads the list
 * when it opens and whenever a source says it changed. The open conversation
 * stays open when it leaves the tab, as when the person answers it.
 *
 * A window narrower than 900px (`useNarrow`, such as 320px or 400 % zoom) shows one pane at a
 * time, as the Inbox does: the list, or the open chat with **Back to chats**, which puts focus
 * back on the chat's row. Opening a chat there puts focus in its box (HAL-18074 MS5).
 */
export function MessengerPage({ messenger }: MessengerPageProps) {
  const [tab, setTab] = useState<MessengerTab>("all");
  const [rows, setRows] = useState<readonly ConversationRow[]>([]);
  const [selected, setSelected] = useState<MessagingId | undefined>(undefined);
  // Grows on each change a source reports, so the list and the open conversation read again.
  const [changed, setChanged] = useState(0);

  useEffect(() => messenger.watch(() => setChanged((count) => count + 1)), [messenger]);

  useEffect(() => {
    let current = true;
    messenger.rows().then(
      (read) => {
        if (current) setRows(read);
      },
      (error: unknown) => console.error("The Messenger couldn't read its chats:", error),
    );
    return () => {
      current = false;
    };
  }, [messenger, changed]);

  const open = rows.find((row) => row.conversation.id === selected);
  const { onePane, list, chat, select, back } = useOnePane(selected, setSelected);
  return (
    <div className="flex h-full min-h-0 gap-2">
      <h1 className="sr-only">{messengerWords.title}</h1>
      {onePane && open !== undefined ? null : (
        <nav
          ref={list}
          aria-label={messengerWords.title}
          className={onePane ? "flex min-w-0 flex-1 flex-col" : "flex w-80 shrink-0 flex-col"}
        >
          <ConversationList
            tab={tab}
            onTab={setTab}
            rows={inTab(rows, tab)}
            selected={selected}
            onSelect={select}
          />
        </nav>
      )}
      {onePane && open === undefined ? null : (
        <main ref={chat} className={`flex min-w-0 flex-1 flex-col ${focusedPanelClass}`}>
          {onePane ? (
            <div className="px-2 pt-2">
              <Button variant="ghost" size="sm" onClick={back}>
                {messengerWords.backToChats}
              </Button>
            </div>
          ) : null}
          {open === undefined ? (
            <p className="m-auto text-small text-fg-muted">{messengerWords.pickChat}</p>
          ) : (
            <ConversationView
              key={open.conversation.id}
              messenger={messenger}
              row={open}
              changed={changed}
            />
          )}
        </main>
      )}
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
    [...chats].find((row) => row.getAttribute("data-chat") === selected)?.focus();
  };
  return { onePane, list, chat, select, back };
}

/**
 * The Messenger's focused app, Halonic Messenger (`shell.focused-apps`): the open workspace's
 * Messenger, with its list on the window's frame and the open chat as the one panel.
 */
export function MessengerWindow({ context }: PlaceViewProps) {
  return <MessengerPage messenger={context.services.get(MessengerService)} />;
}
