import type { AnswerResult, InboxItem } from "@halonicjs/ports";
import { Button, StatusChip } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useState } from "react";
import type { ConversationRow } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import type { QuickActions } from "../quick-actions.ts";
import { MessageBody } from "./message-body.tsx";

/** The props of {@link ChatCards}. */
export interface ChatCardsProps {
  readonly quickActions: QuickActions;
  readonly row: ConversationRow;
  /** Grows each time a source changes, so the cards are read again. */
  readonly changed: number;
}

/**
 * The chat agent's open cards, below its messages (HAL-17421 render 4e). Each
 * option is a button that answers the card through `AgentMessaging.answer`,
 * once; the card is the Inbox's own item, so it leaves both places together.
 */
export function ChatCards({ quickActions, row, changed }: ChatCardsProps) {
  const [cards, setCards] = useState<readonly InboxItem[]>([]);

  const read = useCallback(async () => {
    setCards(await quickActions.cards(row));
  }, [quickActions, row]);

  useEffect(() => {
    void read().catch((error: unknown) =>
      console.error("The chat's cards couldn't be read:", error),
    );
  }, [read, changed]);

  return cards.map((card) => (
    <li key={card.id} className="max-w-[80%]">
      <ChatCard quickActions={quickActions} row={row} card={card} onAnswered={read} />
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
  readonly onAnswered: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [line, setLine] = useState<string | undefined>(undefined);

  async function choose(option: string) {
    setBusy(option);
    try {
      const outcome = await quickActions.answerCard(row, card, option);
      setLine(lineOf(outcome, row));
      // Only an answer that landed takes the card away; otherwise it stays, saying why.
      if (outcome.outcome === "answered") await onAnswered();
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
        {messengerWords.card.waitingSince(timeOf(card.createdAt))}
      </p>
      <MessageBody>{card.question}</MessageBody>
      <div className="flex flex-wrap gap-2">
        {card.options.map((option, index) => (
          <Button
            key={option.id}
            variant={index === 0 ? "primary" : "secondary"}
            busy={busy === option.id}
            onClick={() => {
              void choose(option.id).catch((error: unknown) =>
                console.error("The card couldn't be answered:", error),
              );
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <p className="text-small text-fg-muted" role="status">
        {line ?? messengerWords.card.alsoInInbox}
      </p>
    </article>
  );
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

/** The hour and minute a card came, in the person's own format. */
function timeOf(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}
