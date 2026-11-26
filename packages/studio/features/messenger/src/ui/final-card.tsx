import type { InboxItem, MessagingId } from "@halonicjs/ports";
import {
  ChatText,
  finalState,
  StatusChip,
  useOpenExternal,
  useSettleAway,
} from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import { CardPageLink, chatCardClasses } from "./chat-cards.tsx";

/**
 * A card that just ended, in its final state (`messenger.final-state`): "Approved by Ada · 14:02"
 * or "Cancelled · 14:02" in the kit's words, the same whether it was decided here or elsewhere,
 * over its question, and "Open in Paperclip", where its task keeps it. Nothing for an open card.
 * The line is plain text: the view reads it out once, through its one status region
 * ({@link useSaySettled}).
 */
export function FinalCard({ card }: { readonly card: InboxItem }) {
  const openLink = useOpenExternal();
  if (card.state.kind === "open") return null;
  const { line, tone } = finalState(card.state);
  return (
    <article data-final-state={card.id} className={chatCardClasses}>
      <p data-final-line className="text-small">
        <StatusChip tone={tone}>{line}</StatusChip>
      </p>
      <ChatText openLink={openLink} muted>
        {card.question}
      </ChatText>
      <CardPageLink card={card} />
    </article>
  );
}

/**
 * A chat's card that just ended, in the timeline where it was made: it shows its final state for
 * the kit's hold, then settles out of the chat (`messenger.final-state`).
 */
export function SettlingChatCard({
  card,
  onGone,
}: {
  readonly card: InboxItem;
  readonly onGone: () => void;
}) {
  const item = useRef<HTMLLIElement>(null);
  useSettleAway(item, onGone);
  return (
    <li ref={item} data-chat-card-settling={card.id} className="max-w-[80%]">
      <FinalCard card={card} />
    </li>
  );
}

/**
 * Reads out each card that starts to settle through the view's one status region, `say`: its
 * final-state line (`messenger.final-state`). A card answered here isn't read again, since the
 * view already read out its answer; several that end together are read as one.
 */
export function useSaySettled(
  settling: readonly InboxItem[],
  answeredHere: ReadonlySet<MessagingId>,
  say: (text: string) => void,
): void {
  const said = useRef<ReadonlySet<MessagingId>>(new Set());
  useEffect(() => {
    const fresh = settling.filter((card) => !said.current.has(card.id));
    said.current = new Set(settling.map((card) => card.id));
    const lines = fresh.flatMap((card) =>
      card.state.kind === "open" || answeredHere.has(card.id) ? [] : [finalState(card.state).line],
    );
    if (lines.length > 0) say(lines.join(". "));
  }, [settling, answeredHere, say]);
}
