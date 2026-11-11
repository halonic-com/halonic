// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { type CloseStack, createCloseStack } from "../close-stack/close-stack.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { type CardStack, noCards, openCard, type StackedCard } from "./card-stack.ts";
import { StackedCards } from "./stacked-cards.tsx";

afterEach(unmountAll);

function card(title: string, docked?: boolean): StackedCard {
  return docked === undefined
    ? { key: `part/${title}`, title }
    : { key: `part/${title}`, title, docked };
}

interface AgentPageProps {
  readonly closeStack: CloseStack;
  readonly initial?: CardStack;
  readonly panelWidth?: number;
}

/** Agent "Writer" in "Acme Mail": its map has a button per part, each opening the part's card. */
function AgentPage({ closeStack, initial = noCards, panelWidth = 900 }: AgentPageProps) {
  const [stack, setStack] = useState(initial);
  const open = (part: StackedCard) => setStack((current) => openCard(current, part));
  return (
    <StackedCards
      itemPath={["Acme Mail", "Writer"]}
      stack={stack}
      onChange={setStack}
      closeStack={closeStack}
      panelWidth={panelWidth}
      renderCard={(shown) => (
        <button type="button" onClick={() => open(card(`${shown.title} run`))}>
          Open the run
        </button>
      )}
    >
      <div data-testid="view">
        <button type="button" onClick={() => open(card("draft-reply"))}>
          draft-reply
        </button>
        <button type="button" onClick={() => open(card("triage", true))}>
          triage
        </button>
      </div>
    </StackedCards>
  );
}

function renderPage(props: Partial<AgentPageProps> = {}) {
  const closeStack = props.closeStack ?? createCloseStack();
  const container = render(<AgentPage closeStack={closeStack} {...props} />);
  return { container, closeStack };
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent) === name,
  );
  if (found === undefined) {
    throw new Error(`No button "${name}"`);
  }
  return found;
}

function press(element: HTMLElement): void {
  act(() => {
    element.focus();
    element.click();
  });
}

function view(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-testid="view"]')?.parentElement as HTMLElement;
}

function title(container: HTMLElement): HTMLElement | null {
  return container.querySelector("h2");
}

function stackOf(...titles: string[]): CardStack {
  return titles.reduce((stack, name) => openCard(stack, card(name)), noCards);
}

verifies("shell.stacked-cards", () => {
  describe("full cards", () => {
    it("focuses the opened card's title, named with its path, and makes the view inert", () => {
      const { container } = renderPage();
      press(button(container, "draft-reply"));
      expect(document.activeElement).toBe(title(container));
      expect(title(container)?.getAttribute("aria-label")).toBe(
        "draft-reply, in Acme Mail › Writer › draft-reply",
      );
      expect(view(container).hasAttribute("inert")).toBe(true);
      expect(container.querySelector(".bg-\\(--stack-scrim\\)")).not.toBeNull();
    });

    it("shows the top card and at most 2 bands behind it, each one step higher and narrower", () => {
      const { container } = renderPage({ initial: stackOf("A", "B", "C", "D") });
      const bands = container.querySelectorAll<HTMLElement>('[aria-hidden="true"].rounded-md');
      expect(bands).toHaveLength(2);
      expect(bands[0]?.style.insetInline).toBe("calc(16px + var(--stack-inset) * 2)");
      expect(bands[1]?.style.insetInline).toBe("calc(16px + var(--stack-inset) * 1)");
      expect(bands[0]?.style.top).toBe("calc(16px + var(--stack-peek) * 0)");
      expect(bands[1]?.style.top).toBe("calc(16px + var(--stack-peek) * 1)");
      expect(container.querySelector("section")?.style.top).toBe(
        "calc(16px + var(--stack-peek) * 2)",
      );
      expect(title(container)?.textContent).toBe("D");
    });

    it("goes back to a band's card when it's clicked", () => {
      const { container } = renderPage({ initial: stackOf("A", "B", "C") });
      const bands = container.querySelectorAll<HTMLElement>('[aria-hidden="true"].rounded-md');
      act(() => bands[0]?.click());
      expect(title(container)?.textContent).toBe("A");
    });

    it("goes back through the breadcrumb, the item's own name closing every card", () => {
      const { container } = renderPage({ initial: stackOf("draft-reply", "Run r-42") });
      const path = container.querySelector('nav[aria-label="Card path"]') as HTMLElement;
      expect(path.textContent).toBe("Acme Mail›Writer›draft-reply›Run r-42");
      expect(path.querySelector('[aria-current="location"]')?.textContent).toBe("Run r-42");
      press(button(path, "draft-reply"));
      expect(title(container)?.textContent).toBe("draft-reply");
      press(button(path, "Writer"));
      expect(title(container)).toBeNull();
      expect(view(container).hasAttribute("inert")).toBe(false);
    });

    it("closes the top card with ← and the scrim, and every card with ✕", () => {
      const { container } = renderPage({ initial: stackOf("A", "B", "C") });
      press(button(container, "Back"));
      expect(title(container)?.textContent).toBe("B");
      act(() => container.querySelector<HTMLElement>(".bg-\\(--stack-scrim\\)")?.click());
      expect(title(container)?.textContent).toBe("A");
      act(() => button(container, "Open the run").click());
      press(button(container, "Close all cards"));
      expect(title(container)).toBeNull();
    });

    it('names ✕ "Close all cards" while more than one card is open, else "Close"', () => {
      const { container } = renderPage({ initial: stackOf("draft-reply") });
      expect(button(container, "Close")).toBeDefined();
      press(button(container, "Open the run"));
      expect(button(container, "Close all cards")).toBeDefined();
      press(button(container, "Back"));
      expect(button(container, "Close")).toBeDefined();
    });

    it("closes the top card on Esc and gives the focus back to what opened it", () => {
      const { container, closeStack } = renderPage();
      const opener = button(container, "draft-reply");
      press(opener);
      press(button(container, "Open the run"));
      expect(title(container)?.textContent).toBe("draft-reply run");
      act(() => void closeStack.escape());
      // The button that opened the run was inside draft-reply's body, drawn again: its title.
      expect(document.activeElement).toBe(title(container));
      act(() => void closeStack.escape());
      expect(title(container)).toBeNull();
      expect(document.activeElement).toBe(opener);
    });

    it("leaves a card open on Esc when its tab's page isn't shown", () => {
      const closeStack = createCloseStack();
      const container = render(
        <div hidden>
          <AgentPage closeStack={closeStack} initial={stackOf("draft-reply")} />
        </div>,
      );
      expect(closeStack.escape()).toBe(false);
      expect(title(container)?.textContent).toBe("draft-reply");
    });
  });

  describe("a docked card", () => {
    it("sits at the right of a wide panel, the view usable and undimmed", () => {
      const { container, closeStack } = renderPage();
      press(button(container, "triage"));
      expect(view(container).hasAttribute("inert")).toBe(false);
      expect(container.querySelector(".bg-\\(--stack-scrim\\)")).toBeNull();
      expect(container.querySelector("section")?.className).toContain("w-120");
      expect(closeStack.top()?.kind).toBe("docked-card");
    });

    it("covers a panel under 720px, the view inert", () => {
      const { container } = renderPage({ panelWidth: 700, initial: [card("triage", true)] });
      expect(view(container).hasAttribute("inert")).toBe(true);
      expect(container.querySelector("section")?.className).toContain("inset-0");
    });

    it("stays full width as the band behind a full card opened from it", () => {
      const { container, closeStack } = renderPage({ initial: [card("triage", true)] });
      press(button(container, "Open the run"));
      const band = container.querySelector<HTMLElement>('[aria-hidden="true"].rounded-md');
      expect(band?.style.insetInline).toBe("16px");
      expect(closeStack.top()?.kind).toBe("stacked-card");
      act(() => void closeStack.escape());
      expect(title(container)?.textContent).toBe("triage");
    });
  });
});
