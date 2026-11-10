/**
 * A card in an item page's stack: a part of the item, such as a step, an arrow or a run, shown on
 * top of the side panel (`shell.card-stack`). The shell compares keys, so the same key
 * is the same part.
 */
export interface StackedCard {
  /** What the card shows, such as `step/check` or `arrow/check/reply`. */
  readonly key: string;
  /** The card's title and its part of the breadcrumb, such as "draft-reply". */
  readonly title: string;
  /**
   * Whether the card docks over the right part of the view, leaving the view usable, rather than
   * covering the panel. At most one docked card, always at the bottom of the stack.
   */
  readonly docked?: boolean;
}

/** An item page's cards, the bottom one first. Empty when the panel shows the view itself. */
export type CardStack = readonly StackedCard[];

/** A stack with no cards: the panel shows its view. */
export const noCards: CardStack = [];

/** How many cards show behind the top one; the ones below them are hidden (`shell.card-stack`). */
export const cardsShownBehind = 2;

/** Below this panel width a docked card covers the whole panel, like any card. */
export const dockedCardMinPanelWidth = 720;

/** What `dropGoneCards` did: the stack left, and the lowest card it dropped, to announce. */
export interface DroppedCards {
  readonly stack: CardStack;
  /** The lowest card whose part no longer exists, or `undefined` when every part still does. */
  readonly removed: StackedCard | undefined;
}

/**
 * Opens `card` on top of the stack. A card already in the stack isn't opened twice: the stack
 * goes back to it, closing the cards above it. A docked card always goes to the bottom, so it
 * replaces the stack, the docked card and every card above it included. Returns `stack` itself
 * when nothing changed, so React can compare by identity.
 *
 * @example
 * openCard([writer], draftReply); // [writer, draftReply]
 * openCard([writer, factChecker, sources], factChecker); // [writer, factChecker]
 */
export function openCard(stack: CardStack, card: StackedCard): CardStack {
  const level = stack.findIndex((open) => open.key === card.key);
  if (level >= 0) {
    return backToCard(stack, level);
  }
  if (card.docked === true) {
    return [card];
  }
  return [...stack, card];
}

/**
 * Closes every card above `level`, the index of the card to go back to, as a breadcrumb part or
 * a card behind does. A `level` of -1 closes them all, as the item's own name in the breadcrumb
 * does.
 */
export function backToCard(stack: CardStack, level: number): CardStack {
  const kept = Math.max(level + 1, 0);
  return kept >= stack.length ? stack : stack.slice(0, kept);
}

/** Closes the top card, as Esc, the ← arrow and the empty room round the cards do. */
export function closeTopCard(stack: CardStack): CardStack {
  return backToCard(stack, stack.length - 2);
}

/**
 * Drops the lowest card whose part no longer exists and every card above it. `exists` says
 * whether a card's part is still there.
 *
 * @example
 * const { stack, removed } = dropGoneCards(cards, (card) => workflow.has(card.key));
 * if (removed) announcer.polite(`${removed.title} was removed.`);
 */
export function dropGoneCards(
  stack: CardStack,
  exists: (card: StackedCard) => boolean,
): DroppedCards {
  const gone = stack.findIndex((card) => !exists(card));
  if (gone < 0) {
    return { stack, removed: undefined };
  }
  return { stack: backToCard(stack, gone - 1), removed: stack[gone] };
}

/** The cards drawn: the top one and at most `cardsShownBehind` behind it, the bottom one first. */
export function shownCards(stack: CardStack): CardStack {
  return stack.slice(-(cardsShownBehind + 1));
}

/** The breadcrumb's parts: the item's own path, such as "Acme Mail › Writer", then each card. */
export function cardPath(itemPath: readonly string[], stack: CardStack): readonly string[] {
  return [...itemPath, ...stack.map((card) => card.title)];
}

/**
 * The name of the top card's title, which takes the focus when the card opens (a11y 6.5): its
 * title, then where it is, such as "draft-reply, in Acme Mail › Writer › draft-reply".
 * `undefined` when there are no cards.
 */
export function topCardName(itemPath: readonly string[], stack: CardStack): string | undefined {
  const top = stack.at(-1);
  if (top === undefined) {
    return undefined;
  }
  return `${top.title}, in ${cardPath(itemPath, stack).join(" › ")}`;
}

/** Whether a docked card covers the whole panel, as it does in a panel narrower than 720px. */
export function dockedCardCoversPanel(panelWidth: number): boolean {
  return panelWidth < dockedCardMinPanelWidth;
}
