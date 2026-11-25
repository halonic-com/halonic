import type { MessagingId } from "@halonicjs/ports";
import { Button, Menu } from "@halonicjs/studio-kit";
import type { RefObject } from "react";
import { channelWords } from "../channel-words.ts";
import type { ConversationRow } from "../messenger.ts";
import { focusNextCard } from "./cards-bar.tsx";

/**
 * "2 waiting for you ▾ · Next" above a channel's messages (flow K, render k13a): ▾ lists each
 * question and **Next** moves to the card after the one in focus, the first again after the last.
 * Both put focus on the card's first answer, so the person answers it from there. Nothing shows
 * while no question waits.
 */
export function WaitingBar({
  row,
  section,
}: {
  readonly row: ConversationRow;
  /** The open conversation, whose cards the bar moves between. */
  readonly section: RefObject<HTMLElement | null>;
}) {
  const questions = row.questions ?? [];
  if (questions.length === 0) return null;
  const cards = () => [
    ...(section.current?.querySelectorAll<HTMLElement>("[data-chat-card]") ?? []),
  ];
  const focus = (card: HTMLElement | undefined) =>
    (card?.querySelector<HTMLElement>("button") ?? card)?.focus();
  const show = (item: MessagingId) =>
    focus(cards().find((card) => card.getAttribute("data-chat-card") === item));
  const next = () => focusNextCard(section.current);
  return (
    <div data-waiting-bar className="flex items-center gap-1 border-b border-border px-4 py-1">
      <Menu
        trigger={(props) => (
          <Button {...props} size="sm" variant="ghost">
            {channelWords.waiting.bar(questions.length)}
            <span aria-hidden="true"> ▾</span>
          </Button>
        )}
        entries={questions.map((question) => ({
          id: question.item.id,
          label: channelWords.work.asksYou(question.agent, question.item.question),
          onSelect: () => show(question.item.id),
        }))}
      />
      <span aria-hidden="true"> · </span>
      <Button size="sm" variant="ghost" onClick={next}>
        {channelWords.waiting.next}
      </Button>
    </div>
  );
}
