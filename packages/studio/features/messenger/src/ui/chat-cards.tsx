import type { AnswerResult, InboxItem } from "@halonicjs/ports";
import {
  Button,
  type ButtonVariant,
  ChatText,
  StatusChip,
  useOpenExternal,
  waitingSince,
} from "@halonicjs/studio-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { isChannel } from "../channel.ts";
import { channelWords } from "../channel-words.ts";
import type { ConversationRow } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import type { QuickActions } from "../quick-actions.ts";

/** The props of {@link ChatCards}. */
export interface ChatCardsProps {
  readonly quickActions: QuickActions;
  readonly row: ConversationRow;
  /** Grows each time a source changes, so the cards are read again. */
  readonly changed: number;
  /** Reads a line out in the chat's status region, which stays when the card goes. */
  readonly announce: (line: string) => void;
  /** Called once an answered card is gone, to put focus on what comes next. */
  readonly afterAnswer: () => void;
}

/**
 * The chat agent's open cards, below its messages (HAL-17421 render 4e). Each
 * option is a button that answers the card through `AgentMessaging.answer`,
 * once; the card is the Inbox's own item, so it leaves both places together.
 * Once answered, "Answered: Tomorrow." is read out and focus moves on, as
 * `afterAnswer` says (HAL-18074 MS2).
 */
export function ChatCards({ quickActions, row, changed, announce, afterAnswer }: ChatCardsProps) {
  const [cards, setCards] = useState<readonly InboxItem[]>([]);
  // Set by an answer that landed, so the cards read after it move focus on.
  const answered = useRef(false);

  const read = useCallback(async () => {
    setCards(await quickActions.cards(row));
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

  async function onAnswered(option: string) {
    announce(messengerWords.card.answered(option));
    answered.current = true;
    await read();
  }

  return cards.map((card) => (
    <li key={card.id} data-chat-card={card.id} className="max-w-[80%]">
      <ChatCard quickActions={quickActions} row={row} card={card} onAnswered={onAnswered} />
    </li>
  ));
}

/** One open card: who waits since when, the question, its options, and where else it shows. */
function ChatCard({
  quickActions,
  row,
  card,
  onAnswered,
}: {
  readonly quickActions: QuickActions;
  readonly row: ConversationRow;
  readonly card: InboxItem;
  /** Called with the option's label once the answer landed. */
  readonly onAnswered: (option: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [line, setLine] = useState<string | undefined>(undefined);
  const openLink = useOpenExternal();

  async function choose(option: InboxItem["options"][number]) {
    setBusy(option.id);
    try {
      const outcome = await quickActions.answerCard(row, card, option.id);
      setLine(lineOf(outcome, row));
      // Only an answer that landed takes the card away; otherwise it stays, saying why.
      if (outcome.outcome === "answered") await onAnswered(option.label);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="flex items-center gap-2 text-small text-fg-muted">
        <StatusChip tone="warning" dot>
          {messengerWords.card.needsYou}
        </StatusChip>
        {waitingSince(new Date(card.createdAt), new Date())}
      </p>
      <ChatText openLink={openLink}>{card.question}</ChatText>
      <div className="flex flex-wrap gap-2">
        {card.options.map((option, index) => (
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
        {line ?? alsoInInbox(row)}
      </p>
    </article>
  );
}

/** Where else the card shows: in a channel, also where it was asked (k13a). */
function alsoInInbox(row: ConversationRow): string {
  return isChannel(row)
    ? channelWords.waiting.alsoInInbox(row.conversation.title)
    : messengerWords.card.alsoInInbox;
}

/** What the card says after an answer that didn't land; nothing more once it did. */
function lineOf(outcome: AnswerResult, row: ConversationRow): string | undefined {
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

/** The 1st option is primary, the 2nd secondary and any later one ghost (render 4e). */
function variantOf(index: number): ButtonVariant {
  if (index === 0) return "primary";
  if (index === 1) return "secondary";
  return "ghost";
}
