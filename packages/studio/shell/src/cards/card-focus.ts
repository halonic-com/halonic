import { type RefObject, useLayoutEffect, useRef } from "react";
import type { CardStack, StackedCard } from "./card-stack.ts";

/**
 * Moves focus as the stack changes (a11y 6.5): a card that opens takes it on its title, and a card
 * that closes gives it back to what opened it. When that is gone (it was inside a card that closed,
 * or the part was removed), the card now on top takes it on its title.
 */
export function useCardFocus(stack: CardStack, layer: RefObject<HTMLElement | null>): void {
  const before = useRef<CardStack>(stack);
  const openers = useRef(new Map<string, Element>());

  useLayoutEffect(() => {
    const previous = before.current;
    before.current = stack;
    if (previous === stack) {
      return;
    }
    const top = stack.at(-1);
    const opened = top !== undefined && !previous.some((card) => card.key === top.key);
    if (opened) {
      if (document.activeElement !== null) {
        openers.current.set(top.key, document.activeElement);
      }
      focusTopTitle(layer.current);
    } else {
      giveFocusBack(openers.current, lowestClosed(previous, stack), layer.current);
    }
    forgetClosed(openers.current, stack);
  }, [stack, layer]);
}

/** Gives the focus back to what opened `closed`, else to the title of the card now on top. */
function giveFocusBack(
  openers: ReadonlyMap<string, Element>,
  closed: StackedCard | undefined,
  layer: HTMLElement | null,
): void {
  const opener = closed === undefined ? undefined : openers.get(closed.key);
  if (opener instanceof HTMLElement && canTakeFocus(opener) && focus(opener)) {
    return;
  }
  focusTopTitle(layer);
}

/** The lowest card of `previous` that `stack` no longer has. */
function lowestClosed(previous: CardStack, stack: CardStack): StackedCard | undefined {
  return previous.find((card) => !stack.some((open) => open.key === card.key));
}

function forgetClosed(openers: Map<string, Element>, stack: CardStack): void {
  for (const key of openers.keys()) {
    if (!stack.some((card) => card.key === key)) {
      openers.delete(key);
    }
  }
}

/** Whether `element` is still in the page, and not under a hidden or inert part of it. */
function canTakeFocus(element: HTMLElement): boolean {
  return element.isConnected && element.closest("[hidden], [inert]") === null;
}

/** Focuses `element` and says whether it took the focus. */
function focus(element: HTMLElement): boolean {
  element.focus();
  return document.activeElement === element;
}

function focusTopTitle(layer: HTMLElement | null): void {
  layer?.querySelector<HTMLElement>("[data-top-card-title]")?.focus();
}
