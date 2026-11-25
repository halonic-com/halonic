import type { ReviewCard } from "@halonicjs/app";
import { StatusChip } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import type { Ref } from "react";
import { AssistantHostService } from "../api.ts";
import { buildChatsOf } from "../chat/build-chats.ts";
import { chatTabItem } from "../chat/chat-tab-item.ts";
import type { CardEnd } from "./card-ends.ts";
import { cardWords as words } from "./card-words.ts";

/** Props for {@link CardEndLine}. */
export interface CardEndLineProps {
  readonly end: CardEnd;
  /** The item's name: "Now a change in Support triage." */
  readonly name: string;
  readonly context: WorkspaceContext;
  /** The line focus goes to after a decision on the card (`tabindex="-1"`). */
  readonly line: Ref<HTMLDivElement>;
}

/**
 * The card's state once nothing is left to review (flow-assistant 3.3): a `neutral` chip, never
 * green or ✓, then where the change is now. Read as one line, "Accepted. Now a change in Support
 * triage.", when focus lands on it.
 */
export function CardEndLine({ end, name, context, line }: CardEndLineProps) {
  return (
    <div ref={line} tabIndex={-1} className="mt-1 flex flex-col items-start gap-1 focus-ring">
      <StatusChip tone="neutral">{chipOf(end)}</StatusChip>
      <EndText end={end} name={name} context={context} />
    </div>
  );
}

function EndText({ end, name, context }: Omit<CardEndLineProps, "line">) {
  const text = "text-small text-fg-muted";
  switch (end.kind) {
    case "accepted":
    case "partly":
      return (
        <p className={text}>
          {words.nowAChange(name)} {words.undoItIn}{" "}
          <LinkButton onClick={() => context.openPlace?.("changes")}>
            {words.changesLink}
          </LinkButton>
        </p>
      );
    case "rejected":
      return null;
    case "replaced":
      return (
        <p className={text}>
          {end.sameChat ? words.newerBelow : words.newerInAnotherChat}{" "}
          <LinkButton onClick={() => void goTo(end.by, end.sameChat, context)}>
            {words.goToIt}
          </LinkButton>
        </p>
      );
    case "replaced-outside":
      return <p className={text}>{words.replacedOutside}</p>;
  }
}

/** The words the state line says, as an announcement: "Replaced. A newer change to this file is below." */
export function endInWords(end: CardEnd, name: string): string {
  const chip = `${chipOf(end)}.`;
  switch (end.kind) {
    case "accepted":
    case "partly":
      return `${chip} ${words.nowAChange(name)}`;
    case "rejected":
      return chip;
    case "replaced":
      return `${chip} ${end.sameChat ? words.newerBelow : words.newerInAnotherChat}`;
    case "replaced-outside":
      return `${chip} ${words.replacedOutside}`;
  }
}

function chipOf(end: CardEnd): string {
  switch (end.kind) {
    case "accepted":
      return words.chip.accepted;
    case "partly":
      return words.chip.partly(end.accepted, end.total);
    case "rejected":
      return words.chip.rejected;
    default:
      return words.chip.replaced;
  }
}

function LinkButton({
  onClick,
  children,
}: {
  readonly onClick: () => void;
  readonly children: string;
}) {
  return (
    <button
      type="button"
      className="rounded-xs font-medium text-accent-text underline focus-ring"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** The `id` of a card's `article`, so **Go to it** finds the newer card. */
export function cardElementId(card: ReviewCard): string {
  return `proposal-card-${card.chatId}-${card.cardId}`;
}

/**
 * **Go to it**: scrolls to the newer card and puts focus on its Review. A card of another chat
 * opens that chat first, in the panel or its tab, then goes to it once it shows.
 */
async function goTo(card: ReviewCard, sameChat: boolean, context: WorkspaceContext): Promise<void> {
  if (!sameChat) {
    const chats = buildChatsOf(context.services.get(AssistantHostService));
    // A chat open as a tab is shown there, not in the panel too: one chat in one place.
    if (chats.inTab(card.chatId)) context.openItem?.(chatTabItem(card.chatId));
    else await chats.openChat(card.chatId);
    // The chat renders after this task; the card is there on the next one.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const newer = document.getElementById(cardElementId(card));
  newer?.scrollIntoView?.({ block: "nearest" });
  const buttons = [...(newer?.querySelectorAll("button") ?? [])];
  const review = buttons.find((button) => button.textContent === words.review);
  (review ?? newer)?.focus();
}
