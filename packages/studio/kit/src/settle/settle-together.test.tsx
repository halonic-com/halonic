// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useCallback, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { SettleMotionProvider, settleHoldMs, useSettleAwayTogether } from "./settle.tsx";

/** Three cards that ended in one read, held and sent away as one. */
function EndedTogether({ onGone }: { readonly onGone: () => void }) {
  const list = useRef<HTMLUListElement>(null);
  const elements = useCallback(
    () => [...(list.current?.querySelectorAll<HTMLElement>("li") ?? [])],
    [],
  );
  useSettleAwayTogether(elements, onGone);
  return (
    <ul ref={list}>
      <li data-card="a" />
      <li data-card="b" />
      <li data-card="c" />
    </ul>
  );
}

const card = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-card="${id}"]`) as HTMLElement;

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
});

verifies("kit.settle-together", () => {
  describe("useSettleAwayTogether", () => {
    it("holds cards that ended together for 4 seconds, then plays the motion on all and says gone once", async () => {
      const played: HTMLElement[] = [];
      const out = (element: HTMLElement) => {
        played.push(element);
        expect(element.hasAttribute("inert")).toBe(true);
        return Promise.resolve();
      };
      const gone = vi.fn();
      const { container } = render(
        <SettleMotionProvider out={out}>
          <EndedTogether onGone={gone} />
        </SettleMotionProvider>,
      );

      await pass(settleHoldMs - 1);
      expect(played).toEqual([]);
      await pass(1);

      expect(played).toEqual(["a", "b", "c"].map((id) => card(container, id)));
      expect(gone).toHaveBeenCalledOnce();
    });

    it("pauses while the pointer is over any of them, also as it moves from one to the next", async () => {
      const gone = vi.fn();
      const { container } = render(
        <SettleMotionProvider out={() => Promise.resolve()}>
          <EndedTogether onGone={gone} />
        </SettleMotionProvider>,
      );

      await pass(1000);
      card(container, "a").dispatchEvent(new Event("pointerenter"));
      await pass(5000);
      card(container, "a").dispatchEvent(new Event("pointerleave"));
      card(container, "b").dispatchEvent(new Event("pointerenter"));
      await pass(5000);
      expect(gone).not.toHaveBeenCalled();
      card(container, "b").dispatchEvent(new Event("pointerleave"));
      await pass(2999);
      expect(gone).not.toHaveBeenCalled();
      await pass(1);
      expect(gone).toHaveBeenCalledOnce();
    });

    it("pauses while the focus is in one of them", async () => {
      const gone = vi.fn();
      const { container } = render(
        <SettleMotionProvider out={() => Promise.resolve()}>
          <EndedTogether onGone={gone} />
        </SettleMotionProvider>,
      );

      card(container, "c").dispatchEvent(new FocusEvent("focusin"));
      await pass(settleHoldMs * 3);
      expect(gone).not.toHaveBeenCalled();
      card(container, "c").dispatchEvent(new FocusEvent("focusout"));
      await pass(settleHoldMs);
      expect(gone).toHaveBeenCalledOnce();
    });
  });
});
