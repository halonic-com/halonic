import type { MessagingId } from "@halonicjs/ports";
import { useEffect, useState } from "react";
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
  return (
    <div className="flex h-full min-h-0 gap-2 bg-surface-subtle p-2">
      <nav aria-label={messengerWords.title} className="flex w-80 shrink-0 flex-col">
        <h1 className="sr-only">{messengerWords.title}</h1>
        <ConversationList
          tab={tab}
          onTab={setTab}
          rows={inTab(rows, tab)}
          selected={selected}
          onSelect={setSelected}
        />
      </nav>
      <main className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-surface">
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
    </div>
  );
}
