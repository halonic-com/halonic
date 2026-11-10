import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  backToCard,
  type CardStack,
  cardPath,
  closeTopCard,
  dockedCardCoversPanel,
  dropGoneCards,
  noCards,
  openCard,
  type StackedCard,
  shownCards,
  topCardName,
} from "./card-stack.ts";

function card(title: string, docked?: boolean): StackedCard {
  return docked === undefined
    ? { key: `part/${title}`, title }
    : { key: `part/${title}`, title, docked };
}

function titles(stack: CardStack): string[] {
  return stack.map((open) => open.title);
}

function stackOf(...names: string[]): CardStack {
  return names.reduce((stack, name) => openCard(stack, card(name)), noCards);
}

verifies("shell.card-stack", () => {
  describe("opening", () => {
    it("puts a card on top and names it with its path", () => {
      const stack = openCard(noCards, card("draft-reply"));
      expect(titles(stack)).toEqual(["draft-reply"]);
      expect(cardPath(["Acme Mail", "Writer"], stack)).toEqual([
        "Acme Mail",
        "Writer",
        "draft-reply",
      ]);
      expect(topCardName(["Acme Mail", "Writer"], stack)).toBe(
        "draft-reply, in Acme Mail › Writer › draft-reply",
      );
    });

    it("goes back to a card already in the stack instead of opening it twice", () => {
      const stack = stackOf("fact-checker", "sources");
      expect(titles(openCard(stack, card("fact-checker")))).toEqual(["fact-checker"]);
    });

    it("returns the same stack when the top card opens again", () => {
      const stack = stackOf("A", "B");
      expect(openCard(stack, card("B"))).toBe(stack);
    });

    it("shows the top card and at most two behind it", () => {
      expect(titles(shownCards(stackOf("A", "B", "C", "D")))).toEqual(["B", "C", "D"]);
      expect(titles(shownCards(stackOf("A", "B")))).toEqual(["A", "B"]);
    });

    it("names no card when the stack is empty", () => {
      expect(topCardName(["Writer"], noCards)).toBeUndefined();
    });
  });

  describe("going back", () => {
    it("closes the cards above a breadcrumb part", () => {
      expect(titles(backToCard(stackOf("A", "B", "C"), 0))).toEqual(["A"]);
    });

    it("closes every card when the item itself is picked", () => {
      expect(backToCard(stackOf("A", "B"), -1)).toEqual([]);
    });

    it("closes only the top card on Esc", () => {
      expect(titles(closeTopCard(stackOf("A", "B")))).toEqual(["A"]);
      expect(closeTopCard(noCards)).toBe(noCards);
    });

    it("returns the same stack when going back to the top card", () => {
      const stack = stackOf("A", "B");
      expect(backToCard(stack, 1)).toBe(stack);
    });
  });

  describe("parts that are gone", () => {
    it("drops the gone card and every card above it", () => {
      const stack = stackOf("check", "check → reply");
      const dropped = dropGoneCards(stack, (open) => open.title !== "check");
      expect(dropped.stack).toEqual([]);
      expect(dropped.removed?.title).toBe("check");
    });

    it("keeps the cards below the gone one", () => {
      const dropped = dropGoneCards(stackOf("A", "B", "C"), (open) => open.title !== "B");
      expect(titles(dropped.stack)).toEqual(["A"]);
      expect(dropped.removed?.title).toBe("B");
    });

    it("changes nothing while every part exists", () => {
      const stack = stackOf("A", "B");
      expect(dropGoneCards(stack, () => true)).toEqual({ stack, removed: undefined });
      expect(dropGoneCards(stack, () => true).stack).toBe(stack);
    });
  });

  describe("docked cards", () => {
    it("replaces the docked card and closes every card above it", () => {
      const stack = openCard(openCard(noCards, card("triage", true)), card("Sorter"));
      expect(titles(openCard(stack, card("reply", true)))).toEqual(["reply"]);
    });

    it("stays at the bottom when a card opens over it", () => {
      const stack = openCard(openCard(noCards, card("triage", true)), card("Sorter"));
      expect(stack.map((open) => open.docked === true)).toEqual([true, false]);
    });

    it("goes to the bottom even when full cards are open", () => {
      expect(titles(openCard(stackOf("A", "B"), card("triage", true)))).toEqual(["triage"]);
    });

    it("covers the whole panel below 720px", () => {
      expect(dockedCardCoversPanel(700)).toBe(true);
      expect(dockedCardCoversPanel(720)).toBe(false);
    });
  });
});
