import type { InboxItem, Message, MessagingId } from "@halonicjs/ports";
import { ChatText, useOpenExternal } from "@halonicjs/studio-kit";
import { useLayoutEffect, useRef } from "react";
import { isChannel } from "../channel.ts";
import { chatTimeline } from "../chat-timeline.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { AttachmentList } from "./attachment-list.tsx";
import { authorOf, EmptyChannel, MessageTo, WorkLines } from "./channel-message.tsx";
import { ChatCardItem } from "./chat-cards.tsx";

/** The props of {@link Transcript}. */
export interface TranscriptProps {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  /** Undefined until the first read landed. */
  readonly messages: readonly Message[] | undefined;
  /** The chat's cards, open and answered; undefined until the first read landed. */
  readonly cards: readonly InboxItem[] | undefined;
  readonly questions: ReadonlyMap<MessagingId, string>;
  readonly searching: boolean;
  /** Called with an option's label once it answered a card. */
  readonly onAnswered: (option: string) => Promise<void>;
}

/**
 * The messages and the agent's cards, oldest first, each card where it was made
 * (`messenger.inline-cards`); the chat opens at its latest entry. The person's messages are on the
 * end side. Each message says who wrote it to a screen reader; in a channel it shows it too, and
 * the person's say who they went to and what each agent did with them
 * (`messenger.channel-messages`). An agent writes a message, so whoever can steer that agent does
 * (ADR 2026-11-24, agent-written content): the kit's `ChatText` keeps HTML, images and any link
 * that isn't a web address as plain text, and a web link opens outside the app with its address
 * after it.
 */
export function Transcript({
  messenger,
  row,
  messages,
  cards,
  questions,
  searching,
  onAnswered,
}: TranscriptProps) {
  const channel = isChannel(row);
  const list = useRef<HTMLOListElement>(null);
  const opened = useRef(false);
  const ready = messages !== undefined && cards !== undefined;

  // Once both reads landed, the chat shows its latest entry; later reads leave the scroll alone.
  useLayoutEffect(() => {
    if (opened.current || !ready) return;
    opened.current = true;
    list.current?.lastElementChild?.scrollIntoView?.({ block: "end" });
  }, [ready]);

  const shown = messages ?? [];
  return (
    <ol ref={list} className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4">
      {channel && messages?.length === 0 && !searching ? <EmptyChannel row={row} /> : null}
      {chatTimeline(shown, cards ?? []).map((entry) =>
        entry.kind === "message" ? (
          <MessageItem
            key={entry.message.id}
            messenger={messenger}
            row={row}
            message={entry.message}
            questions={questions}
          />
        ) : (
          <ChatCardItem
            key={entry.card.id}
            quickActions={messenger.quickActions}
            row={row}
            card={entry.card}
            now={messenger.now()}
            onAnswered={onAnswered}
          />
        ),
      )}
    </ol>
  );
}

/** One message: who wrote it, its text and files, and in a channel who it went to. */
function MessageItem({
  messenger,
  row,
  message,
  questions,
}: {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  readonly message: Message;
  readonly questions: ReadonlyMap<MessagingId, string>;
}) {
  const openLink = useOpenExternal();
  const channel = isChannel(row);
  return (
    <li
      data-author={message.author.kind}
      className={message.author.kind === "me" ? "ms-auto max-w-[80%]" : "max-w-[80%]"}
    >
      {channel && message.author.kind !== "me" ? (
        // The sr-only "<name>: " below says it, so a screen reader reads it once (MS11).
        <p className="text-small text-fg-muted" data-author-name aria-hidden="true">
          <bdi>{authorOf(message, row)}</bdi>
        </p>
      ) : null}
      {channel ? <MessageTo message={message} row={row} /> : null}
      <span className="sr-only">{authorOf(message, row)}: </span>
      <ChatText openLink={openLink}>{message.body}</ChatText>
      <AttachmentList messenger={messenger} attachments={message.attachments} />
      {channel ? (
        <WorkLines message={message} row={row} questions={questions} now={messenger.now()} />
      ) : null}
    </li>
  );
}
