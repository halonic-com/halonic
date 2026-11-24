import type { AttachmentRefusal, Message, MessagingRefusal } from "@halonicjs/ports";
import { Button, ChatBoxLine, ChatComposer, ChatText, Input, useOpenExternal } from "@halonicjs/studio-kit";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { DraftFile } from "../draft-files.ts";
import { activityOf, type ConversationRow, type Messenger, refusalOf } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { AttachmentList } from "./attachment-list.tsx";
import { ChatCards } from "./chat-cards.tsx";
import { DraftFilesBar, pastedFiles } from "./draft-files-bar.tsx";

/** The props of {@link ConversationView}. */
export interface ConversationViewProps {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  /** Grows each time a source changes, so the messages are read again. */
  readonly changed: number;
}

/**
 * One open conversation (HAL-17421 render 4a): its agent and activity in the
 * header, a search through its messages, the messages oldest first, and the
 * box. While its source is offline or signed out, the box keeps the text and
 * Send sends nothing (requirement `messenger.conversations`). Files picked or
 * pasted wait in the box and go with the message (`messenger.files`); the
 * agent's cards and "Ask for an update" are its quick actions
 * (`messenger.quick-actions`). The page gives each conversation its own view
 * (a `key`), so its draft and search start fresh.
 */
export function ConversationView({ messenger, row, changed }: ConversationViewProps) {
  const id = row.conversation.id;
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [draft, setDraft] = useState(() => messenger.draft(id));
  const [files, setFiles] = useState(() => messenger.files.of(id));
  const [kept, setKept] = useState<MessagingRefusal | undefined>(undefined);
  // What the last action that sent nothing says: a quick action, a file or a send.
  const [notice, setNotice] = useState<string | undefined>(undefined);
  // Counts the reads, so an answer that arrives after a newer read's never shows.
  const reads = useRef(0);

  const read = useCallback(async () => {
    reads.current += 1;
    const thisRead = reads.current;
    const found = await messenger.messages(id, search);
    if (thisRead === reads.current) setMessages(found);
  }, [messenger, id, search]);

  useEffect(() => {
    void read().catch((error: unknown) => console.error("The chat couldn't be read:", error));
  }, [read, changed]);

  function type(text: string) {
    setDraft(text);
    messenger.setDraft(id, text);
  }

  function addFiles(added: readonly DraftFile[]) {
    let refused: string | undefined;
    for (const file of added) {
      const refusal = messenger.files.add(id, file);
      if (refusal !== undefined) refused = messengerWords.files.refused[refusal](file.name);
    }
    setFiles(messenger.files.of(id));
    setNotice(refused);
  }

  function removeFile(index: number) {
    messenger.files.remove(id, index);
    setFiles(messenger.files.of(id));
  }

  async function send() {
    const outcome = await messenger.sendDraft(id, row);
    if (outcome.outcome === "kept") {
      if (isFileRefusal(outcome.reason)) setNotice(messengerWords.files.notSent);
      else if (outcome.reason !== "blank") setKept(outcome.reason);
      return;
    }
    setKept(undefined);
    setNotice(undefined);
    // The Messenger cleared the draft only if nothing was typed during the send.
    setDraft(messenger.draft(id));
    setFiles(messenger.files.of(id));
    await read();
  }

  async function askForUpdate() {
    const outcome = await messenger.quickActions.askForUpdate(row);
    if (outcome.outcome === "refused") {
      setNotice(
        isFileRefusal(outcome.reason)
          ? messengerWords.files.notSent
          : messengerWords.notSent[outcome.reason](row.source?.label ?? ""),
      );
      return;
    }
    setNotice(undefined);
    await read();
  }

  const name = row.conversation.title;
  const line = notice ?? keptLine(row, kept ?? refusalOf(row));
  return (
    <section aria-label={name} className="flex min-h-0 flex-1 flex-col">
      <ConversationHeader row={row} search={search} onSearch={setSearch} />
      <Transcript messenger={messenger} messages={messages} searching={search.trim() !== ""}>
        <ChatCards quickActions={messenger.quickActions} row={row} changed={changed} />
      </Transcript>
      <div
        className="flex flex-col gap-2 px-4 pb-4"
        onPaste={(event) => {
          const pasted = pastedFiles(event.clipboardData);
          if (pasted.length === 0) return;
          event.preventDefault();
          addFiles(pasted);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <DraftFilesBar files={files} onAdd={addFiles} onRemove={removeFile} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void askForUpdate().catch((error: unknown) =>
                console.error("The chat couldn't ask for an update:", error),
              );
            }}
          >
            {messengerWords.askForUpdate}
          </Button>
        </div>
        <ChatComposer
          label={messengerWords.composerLabel(name)}
          placeholder={messengerWords.composerPlaceholder(name)}
          value={draft}
          onChange={type}
          onSend={() => {
            void send().catch((error: unknown) =>
              console.error("The message couldn't be sent:", error),
            );
          }}
          onStop={() => {}}
          answering={false}
          line={line === undefined ? undefined : <ChatBoxLine tone="warning">{line}</ChatBoxLine>}
        />
      </div>
    </section>
  );
}

/** Why a message would stay in the box, or nothing while the source takes messages. */
function keptLine(row: ConversationRow, refusal: MessagingRefusal | undefined): string | undefined {
  return refusal === undefined ? undefined : messengerWords.kept[refusal](row.source?.label ?? "");
}

const fileRefusals: readonly string[] = ["too-large", "too-many", "unsupported-type"];

/** Whether a send was refused for its files, not for its source. */
function isFileRefusal(reason: string): reason is AttachmentRefusal {
  return fileRefusals.includes(reason);
}

/** The conversation's agent, its source and activity, and the search through its messages. */
function ConversationHeader({
  row,
  search,
  onSearch,
}: {
  readonly row: ConversationRow;
  readonly search: string;
  readonly onSearch: (search: string) => void;
}) {
  const activity = messengerWords.activity[activityOf(row)];
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="truncate text-body-strong">
          <bdi>{row.conversation.title}</bdi>
        </h2>
        <p className="text-small text-fg-muted">
          {[row.source?.label ?? "", activity].filter((part) => part !== "").join(" · ")}
        </p>
      </div>
      <div className="w-56">
        <Input
          size="sm"
          type="search"
          aria-label={messengerWords.searchLabel}
          placeholder={messengerWords.searchLabel}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
    </header>
  );
}

/**
 * The messages, oldest first; the person's on the end side. Each says who wrote it to a screen
 * reader. An agent writes a message, so whoever can steer that agent does (ADR 2026-11-24,
 * agent-written content): the kit's `ChatText` keeps HTML, images and any link that isn't a web
 * address as plain text, and a web link opens outside the app with its address after it.
 */
function Transcript({
  messenger,
  messages,
  searching,
  children,
}: {
  readonly messenger: Messenger;
  readonly messages: readonly Message[];
  readonly searching: boolean;
  /** What follows the messages: the agent's open cards. */
  readonly children: ReactNode;
}) {
  const openLink = useOpenExternal();
  return (
    <ol className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4">
      {messages.length === 0 && searching ? (
        <li className="text-small text-fg-muted">{messengerWords.noMatches}</li>
      ) : null}
      {messages.map((message) => (
        <li
          key={message.id}
          className={message.author.kind === "me" ? "ms-auto max-w-[80%]" : "max-w-[80%]"}
        >
          <span className="sr-only">{authorName(message)}: </span>
          <ChatText openLink={openLink}>{message.body}</ChatText>
          <AttachmentList messenger={messenger} attachments={message.attachments} />
        </li>
      ))}
      {children}
    </ol>
  );
}

function authorName(message: Message): string {
  return message.author.kind === "me" ? messengerWords.you : message.author.name;
}
