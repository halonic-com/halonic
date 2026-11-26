// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Animate, settleOut } from "../motion/motion.ts";
import { render, unmountAll } from "../test/render.tsx";
import { SettleMotionProvider, settleHoldMs, useSettleAway, useSettling } from "./settle.tsx";

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

/** A settling card whose link has the focus as it mounts, as one that replaced a focused card. */
function FocusedSettlingCard({ onGone }: { readonly onGone: () => void }) {
  const element = useRef<HTMLLIElement>(null);
  const link = useRef<HTMLButtonElement>(null);
  // Before the hold's effect runs, so the hold starts with the focus already inside.
  useLayoutEffect(() => link.current?.focus(), []);
  useSettleAway(element, onGone);
  return (
    <li ref={element} data-settling="a" data-state="answered">
      <button ref={link} type="button">
        Open in Paperclip
      </button>
    </li>
  );
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

    it("holds a card the focus is already in as it starts, until the focus leaves", async () => {
      const gone = vi.fn();
      const { container } = render(<FocusedSettlingCard onGone={gone} />);
      const card = container.querySelector("[data-settling]") as HTMLElement;

      await pass(settleHoldMs * 3);
      expect(gone).not.toHaveBeenCalled();
      card.dispatchEvent(new FocusEvent("focusout"));
      await pass(settleHoldMs);
      expect(gone).toHaveBeenCalledOnce();
    });

    it("holds a card the pointer is already over as it starts, until the pointer leaves", async () => {
      vi.spyOn(Element.prototype, "matches").mockImplementation(function hovered(
        this: Element,
        selector: string,
      ) {
        return selector === ":hover" && this instanceof HTMLLIElement;
      });
      const { container, rerender } = render(<Cards cards={[{ id: "a", state: "open" }]} />);
      rerender(<Cards cards={[{ id: "a", state: "answered" }]} />);
      const card = container.querySelector("[data-settling]") as HTMLElement;
      vi.restoreAllMocks();

      await pass(settleHoldMs * 3);
      expect(settlingIds(container)).toEqual(["answered"]);
      card.dispatchEvent(new Event("pointerleave"));
      await pass(settleHoldMs);
      expect(settlingIds(container)).toEqual([]);
    });

    it("still goes when the pointer comes and leaves just as the hold ran out", async () => {
      const { container, rerender } = render(<Cards cards={[{ id: "a", state: "open" }]} />);
      rerender(<Cards cards={[{ id: "a", state: "answered" }]} />);
      const card = container.querySelector("[data-settling]") as HTMLElement;

      // The clock reaches the end of the hold before the timer's callback runs.
      vi.setSystemTime(Date.now() + settleHoldMs);
      card.dispatchEvent(new Event("pointerenter"));
      card.dispatchEvent(new Event("pointerleave"));
      await pass(0);

      expect(settlingIds(container)).toEqual([]);
    });

    it("plays the motion put in, with nothing in the card taking the focus while it goes", async () => {
      const played: HTMLElement[] = [];
      const out = (element: HTMLElement) => {
        played.push(element);
        expect(element.hasAttribute("inert")).toBe(true);
        return Promise.resolve();
      };
      const { container, rerender } = render(
        <SettleMotionProvider out={out}>
          <Cards cards={[{ id: "a", state: "open" }]} />
        </SettleMotionProvider>,
      );
      rerender(
        <SettleMotionProvider out={out}>
          <Cards cards={[{ id: "a", state: "answered" }]} />
        </SettleMotionProvider>,
      );
      const card = container.querySelector("[data-settling]");

      await pass(settleHoldMs);

      expect(played).toEqual([card]);
      expect(settlingIds(container)).toEqual([]);
    });
  });

  describe("settleOut", () => {
    /** An element with the theme's tokens, 96px high and 16px below the one before it. */
    function themed(tag = "li") {
      const element = document.createElement(tag);
      element.style.setProperty("--duration-fast", "120ms");
      element.style.setProperty("--duration-base", "200ms");
      element.style.setProperty("--ease-exit", "ease-in");
      element.style.setProperty("--ease-standard", "ease-out");
      element.style.marginTop = "16px";
      element.getBoundingClientRect = () => ({ height: 96 }) as DOMRect;
      return element;
    }

    /** An `animate` that records each step it plays and ends it at once. */
    function recorder() {
      const calls: [Keyframe[], KeyframeAnimationOptions][] = [];
      const animate: Animate = (_element, keyframes, timing) => {
        calls.push([keyframes, timing]);
        return Promise.resolve();
      };
      return { animate, calls };
    }

    const fade: [Keyframe[], KeyframeAnimationOptions] = [
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 120, easing: "ease-in", fill: "forwards" },
    ];

    it("fades out, then closes its height and the space above it, over --duration-base", async () => {
      const list = document.createElement("ol");
      const element = themed();
      list.append(document.createElement("li"), element);
      const { animate, calls } = recorder();

      await settleOut(element, animate);

      expect(calls).toEqual([
        fade,
        [
          [
            {
              opacity: 0,
              height: "96px",
              marginTop: "16px",
              marginBottom: "0px",
              overflow: "hidden",
            },
            {
              opacity: 0,
              height: "0px",
              marginTop: "0px",
              marginBottom: "-0px",
              overflow: "hidden",
            },
          ],
          { duration: 200, easing: "ease-out", fill: "forwards" },
        ],
      ]);
    });

    it("as the first of a list, takes in the next one's top margin, so nothing jumps", async () => {
      const list = document.createElement("ol");
      const element = themed();
      const next = document.createElement("li");
      next.style.marginTop = "12px";
      list.append(element, next);
      element.style.marginTop = "0px";
      const { animate, calls } = recorder();

      await settleOut(element, animate);

      expect(calls[1]?.[0]).toEqual([
        { opacity: 0, height: "96px", marginTop: "0px", marginBottom: "0px", overflow: "hidden" },
        { opacity: 0, height: "0px", marginTop: "0px", marginBottom: "-12px", overflow: "hidden" },
      ]);
    });

    it("only fades, over --duration-fast, under reduced motion", async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
      }));
      const { animate, calls } = recorder();

      await settleOut(themed(), animate);

      expect(calls).toEqual([fade]);
    });
  });
});
