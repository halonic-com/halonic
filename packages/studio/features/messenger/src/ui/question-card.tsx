import type { InboxItem, InboxQuestion, InboxQuestionsAnswer } from "@halonicjs/ports";
import {
  answerLabels,
  ChatText,
  QuestionForm,
  StatusChip,
  useOpenExternal,
  waitingSince,
} from "@halonicjs/studio-kit";
import { useState } from "react";
import type { ConversationRow } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import type { QuickActions } from "../quick-actions.ts";
import { alsoInInbox, lineOf, tryAnswer } from "./chat-cards.tsx";

/** A card that asks several questions, or one with several picks, and, once answered, was answered with them. */
type QuestionCard = InboxItem & { readonly questions: readonly InboxQuestion[] };

/**
 * Whether a card shows as a form of questions (requirement `messenger.question-cards`): it has
 * `questions`, and it is open or was answered with an `answers` answer. One answered any other
 * way keeps the one-line record of `messenger.inline-cards`.
 */
export function asksQuestions(card: InboxItem): card is QuestionCard {
  if (card.questions === undefined) return false;
  return card.state.kind === "open" || card.state.answer.kind === "answers";
}

/**
 * A card that asks several questions, in the timeline where it was made (HAL-18762, render 4e's
 * card with house controls). Open, each question is a group of radios or checkboxes with
 * **Submit**, which answers every question in one `AgentMessaging.answer`. Answered, it stays as a
 * form with the picks ticked, every control off, and "Answered 24 Nov".
 */
export function QuestionCardItem({
  quickActions,
  row,
  card,
  now,
  onAnswered,
}: {
  readonly quickActions: QuickActions;
  readonly row: ConversationRow;
  readonly card: QuestionCard;
  /** The Messenger's clock, so the card says how long it waits as the Inbox does. */
  readonly now: Date;
  /** Called with the picked options' labels once the answer landed. */
  readonly onAnswered: (option: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | undefined>(undefined);
  const openLink = useOpenExternal();
  const answered =
    card.state.kind === "answered" && card.state.answer.kind === "answers"
      ? { answers: card.state.answer.answers, at: new Date(card.state.answeredAt) }
      : undefined;

  async function submit(answers: InboxQuestionsAnswer["answers"]) {
    setBusy(true);
    try {
      const outcome = await tryAnswer(() => quickActions.answerQuestions(row, card, answers));
      setLine(lineOf(outcome, row));
      if (outcome?.outcome !== "answered") return;
    } finally {
      setBusy(false);
    }
    await onAnswered(answerLabels(card.questions, answers).join(", "));
  }

  return (
    <li
      // An answered card is a record, so the bar's Next and focus after an answer pass it by.
      data-chat-card={answered === undefined ? card.id : undefined}
      data-chat-card-record={answered === undefined ? undefined : card.id}
      className="max-w-[80%]"
    >
      <article className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        {answered === undefined ? (
          <p className="flex items-center gap-2 text-small text-fg-muted">
            <StatusChip tone="warning" dot>
              {messengerWords.card.needsYou}
            </StatusChip>
            {waitingSince(new Date(card.createdAt), now)}
          </p>
        ) : null}
        <ChatText openLink={openLink}>{card.question}</ChatText>
        <QuestionForm
          questions={card.questions}
          answered={answered}
          busy={busy}
          onSubmit={(answers) => {
            void submit(answers).catch((error: unknown) =>
              console.error("The card couldn't be answered:", error),
            );
          }}
        />
        {answered === undefined ? (
          <p className="text-small text-fg-muted" role="status">
            {line ?? alsoInInbox(row)}
          </p>
        ) : null}
      </article>
    </li>
  );
}
