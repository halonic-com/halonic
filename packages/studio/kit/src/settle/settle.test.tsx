// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settleOut } from "../motion/motion.ts";
import { render, unmountAll } from "../test/render.tsx";
import { settleHoldMs, useSettleAway, useSettling } from "./settle.ts";

interface Card {
  readonly id: string;
  readonly state: "open" | "answered";
}

const keyOf = (card: Card) => card.id;

/** A list that shows its open cards, then each card that ended while shown until it settled away. */
function Cards({ cards }: { readonly cards: readonly Card[] }) {
  const open = cards.filter((card) => card.state === "open");
  const endedOf = (left: Card) =>
    cards.find((card) => card.id === left.id && card.state !== "open");
  const { settling, gone } = useSettling(open, keyOf, endedOf);
  return (
    <ul>
      {open.map((card) => (
        <li key={card.id} data-open={card.id} />
      ))}
      {settling.map((card) => (
        <SettlingCard key={card.id} card={card} onGone={() => gone(card.id)} />
      ))}
    </ul>
  );
}

function SettlingCard({ card, onGone }: { readonly card: Card; readonly onGone: () => void }) {
  const element = useRef<HTMLLIElement>(null);
  useSettleAway(element, onGone);
  return <li ref={element} data-settling={card.id} data-state={card.state} />;
}

const settlingIds = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-settling]")].map((each) => each.getAttribute("data-state"));

async function pass(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

verifies("kit.settle", () => {
  describe("useSettling and useSettleAway", () => {
    it("settles a card answered while shown with its answered state, and lets it go after 4 seconds", async () => {
      const { container, rerender } = render(<Cards cards={[{ id: "a", state: "open" }]} />);

      rerender(<Cards cards={[{ id: "a", state: "answered" }]} />);
      expect(container.querySelector("[data-open]")).toBeNull();
      expect(settlingIds(container)).toEqual(["answered"]);

      await pass(settleHoldMs - 1);
      expect(settlingIds(container)).toEqual(["answered"]);
      await pass(1);
      expect(settlingIds(container)).toEqual([]);
    });

    it("never settles a card that had already ended, or one gone with no end known", () => {
      const { container, rerender } = render(
        <Cards
          cards={[
            { id: "a", state: "answered" },
            { id: "b", state: "open" },
          ]}
        />,
      );
      expect(settlingIds(container)).toEqual([]);

      rerender(<Cards cards={[{ id: "a", state: "answered" }]} />);
      expect(settlingIds(container)).toEqual([]);
    });

    it("stops settling a card that opens again", () => {
      const { container, rerender } = render(<Cards cards={[{ id: "a", state: "open" }]} />);
      rerender(<Cards cards={[{ id: "a", state: "answered" }]} />);

      rerender(<Cards cards={[{ id: "a", state: "open" }]} />);

      expect(settlingIds(container)).toEqual([]);
      expect(container.querySelector("[data-open='a']")).not.toBeNull();
    });

    it("pauses the hold while the pointer is over the card, and goes on for what was left", async () => {
      const { container, rerender } = render(<Cards cards={[{ id: "a", state: "open" }]} />);
      rerender(<Cards cards={[{ id: "a", state: "answered" }]} />);
      const card = container.querySelector("[data-settling]") as HTMLElement;

      await pass(1000);
      card.dispatchEvent(new Event("pointerenter"));
      await pass(10_000);
      expect(settlingIds(container)).toEqual(["answered"]);
      card.dispatchEvent(new Event("pointerleave"));
      await pass(2999);
      expect(settlingIds(container)).toEqual(["answered"]);
      await pass(1);
      expect(settlingIds(container)).toEqual([]);
    });

    it("holds while the focus is in the card", async () => {
      const { container, rerender } = render(<Cards cards={[{ id: "a", state: "open" }]} />);
      rerender(<Cards cards={[{ id: "a", state: "answered" }]} />);
      const card = container.querySelector("[data-settling]") as HTMLElement;

      card.dispatchEvent(new FocusEvent("focusin"));
      await pass(settleHoldMs * 3);
      expect(settlingIds(container)).toEqual(["answered"]);
      card.dispatchEvent(new FocusEvent("focusout"));
      await pass(settleHoldMs);
      expect(settlingIds(container)).toEqual([]);
    });
  });

  describe("settleOut", () => {
    function animatable() {
      const element = document.createElement("li");
      element.style.setProperty("--duration-fast", "120ms");
      element.style.setProperty("--duration-base", "200ms");
      element.style.setProperty("--ease-exit", "ease-in");
      element.getBoundingClientRect = () => ({ height: 96 }) as DOMRect;
      const calls: [Keyframe[], KeyframeAnimationOptions][] = [];
      element.animate = (keyframes, timing) => {
        calls.push([keyframes as Keyframe[], timing as KeyframeAnimationOptions]);
        return { finished: Promise.resolve() } as unknown as Animation;
      };
      return { element, calls };
    }

    it("fades out while its height closes, over --duration-base", async () => {
      const { element, calls } = animatable();
      await settleOut(element);
      expect(calls).toEqual([
        [
          [
            { opacity: 1, height: "96px", overflow: "hidden" },
            { opacity: 0, height: "0px", overflow: "hidden" },
          ],
          { duration: 200, easing: "ease-in", fill: "forwards" },
        ],
      ]);
    });

    it("only fades, over --duration-fast, under reduced motion", async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
      }));
      const { element, calls } = animatable();
      await settleOut(element);
      expect(calls).toEqual([
        [[{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-in", fill: "forwards" }],
      ]);
    });
  });
});
