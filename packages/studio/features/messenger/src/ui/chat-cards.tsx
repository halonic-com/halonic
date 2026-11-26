import type { AnswerResult, InboxItem } from "@halonicjs/ports";
import {
  Button,
  type ButtonVariant,
  ChatText,
  enter,
  leave,
  StatusChip,
  TickIcon,
  useOpenExternal,
  waitingSince,
} from "@halonicjs/studio-kit";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isChannel } from "../channel.ts";
import { channelWords } from "../channel-words.ts";
import { cardRecord } from "../chat-timeline.ts";
import type { ConversationRow } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import type { QuickActions } from "../quick-actions.ts";
import { reportMotion } from "./load-states.tsx";

/** What {@link useChatCards} gives: the chat's cards, open and answered, and how to answer one. */
export interface ChatCardsState {
  /** Undefined until the first read landed. */
  readonly cards: readonly InboxItem[] | undefined;
  /** Called with an option's label once it answered a card. */
  readonly onAnswered: (option: string) => Promise<void>;
}

/**
 * The chat's cards, open and answered, read again on each change (requirement
 * `messenger.inline-cards`). Once an option answered a card, "Answered: Tomorrow." is passed to
 * `announce` and, after the cards are read again, `afterAnswer` moves focus on (HAL-18074 MS2).
 */
export function useChatCards(
  quickActions: QuickActions,
  row: ConversationRow,
  changed: number,
  announce: (line: string) => void,
  afterAnswer: () => void,
): ChatCardsState {
  const [cards, setCards] = useState<readonly InboxItem[] | undefined>(undefined);
  // Set by an answer that landed, so the cards read after it move focus on.
  const answered = useRef(false);

  const read = useCallback(async () => {
    setCards(await quickActions.chatCards(row));
  }, [quickActions, row]);

  useEffect(() => {
    void read().catch((error: unknown) =>
      console.error("The chat's cards couldn't be read:", error),
    );
  }, [read, changed]);

  useEffect(() => {
    if (!answered.current) return;
    answered.current = false;
    afterAnswer();
  }, [cards, afterAnswer]);

  const onAnswered = useCallback(
    async (option: string) => {
      announce(messengerWords.card.answered(option));
      answered.current = true;
      await read();
    },
    [announce, read],
  );

  return { cards, onAnswered };
}

/**
 * One of the chat agent's cards, in the timeline where it was made. An open card (HAL-17421
 * render 4e) offers each option as a button that answers it through `AgentMessaging.answer`, once;
 * it is the Inbox's own item, so it is answered in both places together. An answered card stays as
 * its record, "Approve, 12:10" (`messenger.inline-cards`).
 */
export function ChatCardItem({
  quickActions,
  row,
  card,
  now,
  onAnswered,
}: {
  readonly quickActions: QuickActions;
  readonly row: ConversationRow;
  readonly card: InboxItem;
  /** The Messenger's clock, so the card says how long it waits as the Inbox does. */
  readonly now: Date;
  readonly onAnswered: (option: string) => Promise<void>;
}) {
  // While the person's answer is on its way and the card folds away, it stays the card, even
  // once the source reports the change and the card comes back answered.
  const [folding, setFolding] = useState(false);
  const record = folding ? undefined : cardRecord(card);
  const item = useRef<HTMLLIElement>(null);
  const wasOpen = useRef(record === undefined);
  // A card answered while it showed fades into its record (motion 5 of the design review).
  useLayoutEffect(() => {
    if (record === undefined || !wasOpen.current) return;
    wasOpen.current = false;
    if (item.current !== null) enter(item.current, { move: "none" }).catch(reportMotion);
  }, [record]);
  if (record !== undefined) {
    return (
      <li
        ref={item}
        data-chat-card-record={card.id}
        className="max-w-[80%] text-small text-fg-muted"
      >
        <span className="sr-only">{messengerWords.card.recordPrefix}</span>
        {record}
      </li>
    );
  }
  return (
    <li ref={item} data-chat-card={card.id} className="max-w-[80%]">
      <ChatCard
        quickActions={quickActions}
        row={row}
        card={card}
        now={now}
        onFolding={setFolding}
        onAnswered={onAnswered}
      />
    </li>
  );
}

/** One open card: who waits since when, the question, its options, and where else it shows. */
function ChatCard({
  quickActions,
  row,
  card,
  now,
  onFolding,
  onAnswered,
}: {
  readonly quickActions: QuickActions;
  readonly row: ConversationRow;
  readonly card: InboxItem;
  readonly now: Date;
  /** True from an option's press until the card folded away, or the answer didn't land. */
  readonly onFolding: (folding: boolean) => void;
  /** Called with the option's label once the answer landed and the card folded away. */
  readonly onAnswered: (option: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [line, setLine] = useState<string | undefined>(undefined);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const article = useRef<HTMLElement>(null);
  const openLink = useOpenExternal();

  async function choose(option: InboxItem["options"][number]) {
    setBusy(option.id);
    onFolding(true);
    try {
      const outcome = await quickActions.answerCard(row, card, option.id);
      setLine(lineOf(outcome, row));
      // Only an answer that landed takes the card away; otherwise it stays, saying why.
      if (outcome.outcome !== "answered") return;
      setChosen(option.label);
      await foldAway(article.current).catch(reportMotion);
    } finally {
      setBusy(undefined);
      // The record, if the source already reported it, takes the folded card's place now.
      onFolding(false);
    }
    await onAnswered(option.label);
  }

  return (
    <article
      ref={article}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <p className="flex items-center gap-2 text-small text-fg-muted">
        <StatusChip tone="warning" dot>
          {messengerWords.card.needsYou}
        </StatusChip>
        {waitingSince(new Date(card.createdAt), now)}
      </p>
      <ChatText openLink={openLink}>{card.question}</ChatText>
      <div className="flex flex-wrap gap-2">
        {chosen === undefined ? null : (
          <StatusChip tone="success">
            <span
              aria-hidden="true"
              className="inline-grid size-icon-sm shrink-0 place-items-center align-middle *:size-full"
            >
              <TickIcon />
            </span>{" "}
            {chosen}
          </StatusChip>
        )}
        {(chosen === undefined ? answerableHere(card) : []).map((option, index) => (
          <Button
            key={option.id}
            variant={variantOf(index)}
            busy={busy === option.id}
            onClick={() => {
              void choose(option).catch((error: unknown) =>
                console.error("The card couldn't be answered:", error),
              );
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <p className="text-small text-fg-muted" role="status">
        {line ?? whereElse(row, card)}
      </p>
    </article>
  );
}

/**
 * Once a card is answered: the choice shows for `--duration-slow`, then the card fades out
 * (motion 5). Under reduced motion it goes at once, and the record takes its place.
 */
async function foldAway(element: HTMLElement | null): Promise<void> {
  if (element === null || typeof element.animate !== "function") return;
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true) return;
  const hold = Number.parseFloat(getComputedStyle(element).getPropertyValue("--duration-slow"));
  await element.animate([{ opacity: 1 }, { opacity: 1 }], { duration: hold || 0 }).finished;
  await leave(element);
}

/** Where else the card shows: in a channel, also where it was asked (k13a). */
export function alsoInInbox(row: ConversationRow): string {
  return isChannel(row)
    ? channelWords.waiting.alsoInInbox(row.conversation.title)
    : messengerWords.card.alsoInInbox;
}

/**
 * The card's footer before any answer: which options left out of it need a note in the Inbox,
 * else where else it shows, so a missing option never goes unsaid (HAL-19018).
 */
function whereElse(row: ConversationRow, card: InboxItem): string {
  const leftOut = card.options.filter(needsNote).map((option) => option.label);
  return leftOut.length === 0 ? alsoInInbox(row) : messengerWords.card.needsNoteInInbox(leftOut);
}

/** What the card says after an answer that didn't land; nothing more once it did. */
export function lineOf(outcome: AnswerResult, row: ConversationRow): string | undefined {
  if (outcome.outcome === "refused") {
    return messengerWords.notSent[outcome.reason](row.source?.label ?? "");
  }
  if (outcome.outcome === "already-answered") {
    if (outcome.by.kind === "me") {
      return messengerWords.card.answeredByYou;
    }
    return messengerWords.card.answeredBy(outcome.by.name);
  }
  return undefined;
}

/**
 * The options a chat card offers: those whose note is required are left out, since the chat has
 * no note field yet; the Inbox answers them (`messenger.option-note`).
 */
function answerableHere(card: InboxItem): readonly InboxItem["options"][number][] {
  return card.options.filter((option) => !needsNote(option));
}

/** Whether an option can't be answered without a note, which a chat has no field for yet. */
function needsNote(option: InboxItem["options"][number]): boolean {
  return option.noteRequired === true;
}

/** The 1st option is primary, the 2nd secondary and any later one ghost (render 4e). */
function variantOf(index: number): ButtonVariant {
  if (index === 0) return "primary";
  if (index === 1) return "secondary";
  return "ghost";
}
