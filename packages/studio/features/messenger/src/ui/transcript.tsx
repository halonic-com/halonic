import type { InboxItem, Message, MessagingId } from "@halonicjs/ports";
import { Button, ChatLoading, EmptyState, enter } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isChannel } from "../channel.ts";
import { type ChatLine, chatLines, type PendingMessage } from "../chat-layout.ts";
import { chatTimeline } from "../chat-timeline.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { EmptyChannel } from "./channel-message.tsx";
import { ChatCardItem } from "./chat-cards.tsx";
import { failureReason, reportMotion } from "./load-states.tsx";
import { DayItem, MessageItem, PendingItem } from "./message-item.tsx";
import { asksQuestions, QuestionCardItem } from "./question-card.tsx";
import { agentTyping, TypingLine } from "./typing-line.tsx";

/** Within this many pixels of the end, the person reads the newest entry and the chat stays there. */
const PINNED_WITHIN_PX = 24;

/** The props of {@link Transcript}. */
export interface TranscriptProps {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  /** Undefined until the first read landed. */
  readonly messages: readonly Message[] | undefined;
  /** The chat's cards, open and answered; undefined until the first read landed. */
  readonly cards: readonly InboxItem[] | undefined;
  /** The person's messages on their way. */
  readonly pending: readonly PendingMessage[];
  readonly questions: ReadonlyMap<MessagingId, string>;
  readonly searching: boolean;
  /** What the chat's find bar found, and which of it is shown (`messenger.find-in-chat`). */
  readonly found?: {
    readonly matches: ReadonlySet<MessagingId>;
    readonly current: MessagingId | undefined;
  };
  /** Why the last read of the messages failed; none once one landed. */
  readonly failure: unknown;
  readonly words: EngineWords;
  /** Reads the messages again. */
  readonly onRetry: () => void;
  /** The chat agent's picture beside each run of its messages. */
  readonly picture: ImageBitmap | undefined;
  /** Called with an option's label once it answered a card. */
  readonly onAnswered: (option: string) => Promise<void>;
}

/**
 * The messages and the agent's cards, oldest first, each card where it was made
 * (`messenger.inline-cards`), in a column at most 800px wide in the middle of the pane, with the
 * day's label before each day and the person's messages in bubbles (`messenger.chat-transcript`).
 * The chat opens at its latest entry and stays there while the person reads it; scrolled up, it
 * doesn't move, and "1 new message ↓" brings the person down. While the first read is on its way
 * it shows the kit's loading lines, and if it fails "Couldn't load this chat" with **Try again**
 * (`messenger.load-states`). An agent writes a message, so whoever can steer that agent does
 * (ADR 2026-11-24, agent-written content): the kit's `ChatText` keeps HTML, images and any link
 * that isn't a web address as plain text. Under the messages, "Chief is typing…" shows while the
 * agent works on the chat (`messenger.typing`).
 */
export function Transcript(props: TranscriptProps) {
  const { messenger, row, messages, cards, pending, failure, words, onRetry } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const lines = chatLines(
    chatTimeline(messages ?? [], cards ?? []),
    pending,
    messenger.now(),
    isChannel(row),
  );
  const typing = agentTyping(row, messages, pending, props.searching);
  const { unseen, onScroll, toEnd } = useStickToEnd(scroller, list, lines, {
    messages: messages !== undefined,
    cards: cards !== undefined,
    searching: props.searching,
    typing,
  });

  if (messages === undefined && failure !== undefined) {
    const title = messengerWords.load.chatFailed;
    return (
      // The state's own padding puts its text on the transcript's edge.
      <div className="mx-auto w-full max-w-[800px] py-4">
        <EmptyState
          tone="error"
          align="start"
          title={title}
          description={failureReason(failure, title, words)}
          action={{ label: messengerWords.load.tryAgain, onClick: onRetry }}
        />
      </div>
    );
  }
  if (messages === undefined) {
    return (
      // The loading lines fill the transcript's column, as the messages will.
      <div className="mx-auto w-full max-w-[800px] *:max-w-none">
        <ChatLoading label={messengerWords.load.chat} onRetry={onRetry} />
      </div>
    );
  }
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
        <div role="status">
          {failure === undefined ? null : (
            <p className="mx-auto max-w-[800px] px-4 pt-4 text-small text-fg-muted">
              {words.showingLast}
            </p>
          )}
        </div>
        {/* A run's messages sit 4px apart, a new run 24px, anything else 16px. */}
        <ol
          ref={list}
          className="mx-auto flex w-full max-w-[800px] flex-col px-4 py-4 [&>li+li]:mt-4 [&>li+li[data-follows]]:mt-1 [&>li+li[data-head]]:mt-6"
        >
          {isChannel(row) && messages.length === 0 && !props.searching ? (
            <EmptyChannel row={row} />
          ) : null}
          {lines.map((line) => (
            <Line key={line.key} line={line} {...props} />
          ))}
        </ol>
        <TypingLine row={row} typing={typing} />
      </div>
      {unseen === 0 ? null : (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span ref={arrive} data-new-messages className="pointer-events-auto">
            <Button size="sm" variant="secondary" onClick={toEnd}>
              {messengerWords.newMessages(unseen)}
              <span aria-hidden="true"> ↓</span>
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}

function Line({ line, ...props }: TranscriptProps & { readonly line: ChatLine }) {
  if (line.kind === "day") return <DayItem label={line.label} />;
  if (line.kind === "pending") return <PendingItem pending={line.pending} follows={line.follows} />;
  if (line.kind === "card") {
    const card = line.card;
    const shared = {
      quickActions: props.messenger.quickActions,
      row: props.row,
      now: props.messenger.now(),
      onAnswered: props.onAnswered,
    };
    return asksQuestions(card) ? (
      <QuestionCardItem {...shared} card={card} />
    ) : (
      <ChatCardItem {...shared} card={card} />
    );
  }
  return (
    <MessageItem
      messenger={props.messenger}
      row={props.row}
      message={line.message}
      head={line.head}
      follows={line.follows}
      picture={props.picture}
      questions={props.questions}
      found={foundOf(line.message.id, props.found)}
    />
  );
}

/** Whether the find bar found a message, and whether it is the match shown. */
function foundOf(
  message: MessagingId,
  found: TranscriptProps["found"],
): "current" | "match" | undefined {
  if (found?.current === message) return "current";
  return found?.matches.has(message) === true ? "match" : undefined;
}

/** Rises into view once, as it mounts: the "new message" pill. */
function arrive(element: HTMLElement | null): void {
  if (element !== null) enter(element).catch(reportMotion);
}

/**
 * Keeps the chat at its newest entry (motions 3 and 4 of the design review): it opens there as
 * soon as its messages landed, without waiting for its cards (`messenger.open-at-newest`), and
 * then follows new entries, and the transcript growing, while the person is within 24px of the
 * end, or sent something. The cards' first read only puts them in their place. The typing line
 * appearing keeps the person at the end there too.
 * Scrolled up, a new message from someone else only counts toward the pill. Each new entry rises
 * into view, except a search's results and the person's own message that took its pending one's
 * place.
 */
function useStickToEnd(
  scroller: RefObject<HTMLDivElement | null>,
  list: RefObject<HTMLOListElement | null>,
  lines: readonly ChatLine[],
  read: {
    readonly messages: boolean;
    readonly cards: boolean;
    readonly searching: boolean;
    /** What the chat's find bar found, and which of it is shown (`messenger.find-in-chat`). */
    readonly found?: {
      readonly matches: ReadonlySet<MessagingId>;
      readonly current: MessagingId | undefined;
    };
    /** The typing line shows under the messages. */
    readonly typing: boolean;
  },
) {
  const { searching } = read;
  const [unseen, setUnseen] = useState(0);
  const pinned = useRef(true);
  const known = useRef<ReadonlySet<string> | undefined>(undefined);
  const wasSearching = useRef(searching);
  const hadCards = useRef(read.cards);
  const keys = lines.map((line) => line.key).join("\n");

  const toEnd = (smooth: boolean) => {
    const element = scroller.current;
    // The person asked for the end, so new entries follow it there.
    pinned.current = true;
    setUnseen(0);
    if (element === null) return;
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const behavior = smooth && !reduced ? "smooth" : "auto";
    element.scrollTo?.({ top: element.scrollHeight, behavior });
  };

  // The cards' first read puts them in their place; the person at the end stays there.
  const cardsFirstLanded = (): boolean => {
    const landed = read.cards && !hadCards.current;
    hadCards.current = read.cards;
    if (landed && pinned.current) toEnd(false);
    return landed;
  };

  // It runs once per change of the lines' keys, not on each render's new `lines` array.
  useLayoutEffect(() => {
    if (!read.messages) return;
    const before = known.current;
    known.current = new Set(lines.map((line) => line.key));
    if (before === undefined) {
      // Cards read with the messages are in their place already: their read never lands later.
      hadCards.current = read.cards;
      // The chat opens at its latest entry, before its first paint, with no scroll to watch.
      list.current?.lastElementChild?.scrollIntoView?.({ block: "end" });
      return;
    }
    // A search, and the end of one, swap the lines: nothing in them is new.
    const swapped = searching || wasSearching.current;
    wasSearching.current = searching;
    // The cards' first read only puts them in their place: they aren't new either.
    const placed = cardsFirstLanded();
    const added = lines.filter(
      (line) => !before.has(line.key) && line.kind !== "day" && !(placed && line.kind === "card"),
    );
    if (swapped || added.length === 0) return;
    riseIntoView(list.current, lines, added);
    if (added.some((line) => line.kind === "pending") || pinned.current) toEnd(false);
    else setUnseen((count) => count + added.filter(isNewToThePerson).length);
  }, [keys, read.messages, read.cards, searching]);

  // The typing line coming in under the messages keeps the person at the end seeing it.
  useLayoutEffect(() => {
    if (read.typing && pinned.current) toEnd(false);
  }, [read.typing]);

  // A picture or a long message taking its size grows the transcript; the person at the end stays there.
  useEffect(() => {
    const element = list.current;
    if (!read.messages || element === null || globalThis.ResizeObserver === undefined) return;
    const watcher = new ResizeObserver(() => {
      if (pinned.current) toEnd(false);
    });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [read.messages]);

  const onScroll = () => {
    const element = scroller.current;
    if (element === null) return;
    const left = element.scrollHeight - element.scrollTop - element.clientHeight;
    pinned.current = left <= PINNED_WITHIN_PX;
    if (pinned.current) setUnseen(0);
  };

  return { unseen, onScroll, toEnd: () => toEnd(true) };
}

/** A message the person didn't write: their own, sent while scrolled up, is no news to them. */
function isNewToThePerson(line: ChatLine): boolean {
  return line.kind === "message" && line.message.author.kind !== "me";
}

/** Each added line's element rises into view; the person's sent message already did as pending. */
function riseIntoView(
  list: HTMLOListElement | null,
  lines: readonly ChatLine[],
  added: readonly ChatLine[],
): void {
  if (list === null) return;
  // A channel's empty line may come before the lines.
  const offset = list.children.length - lines.length;
  for (const line of added) {
    if (line.kind === "message" && line.message.author.kind === "me") continue;
    const element = list.children[lines.indexOf(line) + offset];
    if (element instanceof HTMLElement) enter(element).catch(reportMotion);
  }
}
