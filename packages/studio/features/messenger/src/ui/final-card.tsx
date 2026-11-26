import type { InboxItem } from "@halonicjs/ports";
import {
  ChatText,
  finalState,
  StatusChip,
  useOpenExternal,
  useSettleAway,
} from "@halonicjs/studio-kit";
import { useRef } from "react";
import { CardPageLink, chatCardClasses } from "./chat-cards.tsx";

/**
 * A card that just ended, in its final state (`messenger.final-state`): "Approved by Ada · 14:02"
 * or "Cancelled · 14:02" in the kit's words, the same whether it was decided here or elsewhere,
 * over its question, and "Open in Paperclip", where its task keeps it. Nothing for an open card.
 */
export function FinalCard({ card }: { readonly card: InboxItem }) {
  const openLink = useOpenExternal();
  if (card.state.kind === "open") return null;
  const { line, tone } = finalState(card.state);
  return (
    <article data-final-state={card.id} className={chatCardClasses}>
      <p role="status" className="text-small">
        <StatusChip tone={tone}>{line}</StatusChip>
      </p>
      <div className="text-fg-muted">
        <ChatText openLink={openLink}>{card.question}</ChatText>
      </div>
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
