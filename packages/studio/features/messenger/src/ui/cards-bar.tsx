import type { InboxItem } from "@halonicjs/ports";
import { Button } from "@halonicjs/studio-kit";
import type { RefObject } from "react";
import { waitingCards } from "../chat-timeline.ts";
import { messengerWords } from "../messenger-words.ts";

/**
 * The thin bar under a chat while its cards wait, "3 cards waiting" (requirement
 * `messenger.inline-cards`). Pressing it scrolls to the oldest open card and puts focus on its first
 * answer. Nothing shows while no card waits.
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
    card?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  };
  return (
    <div data-cards-bar className="flex justify-center border-t border-border px-4 py-1">
      <Button size="sm" variant="ghost" onClick={show}>
        {messengerWords.cardsWaiting(waiting.length)}
      </Button>
    </div>
  );
}
