import type { InboxItem } from "@halonicjs/ports";
import { Button } from "@halonicjs/studio-kit";
import type { RefObject } from "react";
import { channelWords } from "../channel-words.ts";
import { waitingCards } from "../chat-timeline.ts";
import { messengerWords } from "../messenger-words.ts";

/**
 * The thin bar under a chat while its cards wait, "3 cards waiting · Next" (requirement
 * `messenger.inline-cards`). Pressing the count scrolls to the oldest open card and puts focus on
 * its first answer; **Next** moves to the open card after the one in focus, as a channel's bar
 * does (flow 5.2 of the design review). Nothing shows while no card waits.
 */
export function CardsBar({
  cards,
  section,
}: {
  readonly cards: readonly InboxItem[];
  /** The open conversation, whose timeline holds the cards. */
  readonly section: RefObject<HTMLElement | null>;
}) {
  const waiting = waitingCards(cards);
  const oldest = waiting[0];
  if (oldest === undefined) return null;
  const show = () => {
    const card = [
      ...(section.current?.querySelectorAll<HTMLElement>("[data-chat-card]") ?? []),
    ].find((each) => each.getAttribute("data-chat-card") === oldest.id);
    card?.scrollIntoView?.({ block: "center" });
    card?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
  };
  return (
    <div data-cards-bar className="border-t border-border px-4 py-1">
      <div className="mx-auto flex w-full max-w-[800px] items-center justify-center gap-1">
        <Button size="sm" variant="ghost" onClick={show}>
          {messengerWords.cardsWaiting(waiting.length)}
        </Button>
        <span aria-hidden="true"> · </span>
        <Button size="sm" variant="ghost" onClick={() => focusNextCard(section.current)}>
          {channelWords.waiting.next}
        </Button>
      </div>
    </div>
  );
}

/**
 * Puts focus on the first answer of the open card after the one in focus, the first again after
 * the last, and scrolls it into view.
 */
export function focusNextCard(section: HTMLElement | null): void {
  const cards = [...(section?.querySelectorAll<HTMLElement>("[data-chat-card]") ?? [])];
  const current = cards.findIndex((card) => card.contains(document.activeElement));
  const card = cards[(current + 1) % cards.length];
  card?.scrollIntoView?.({ block: "center" });
  (card?.querySelector<HTMLElement>("button, input") ?? card)?.focus({ preventScroll: true });
}
