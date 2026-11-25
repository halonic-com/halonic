// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enter, flip, leave, swap } from "./motion.ts";

const TOKENS: Record<string, string> = {
  "--duration-fast": "120ms",
  "--duration-base": "0.2s",
  "--motion-rise": "8px",
  "--motion-slide": "24px",
  "--ease-enter": "cubic-bezier(0.22, 1, 0.36, 1)",
  "--ease-exit": "cubic-bezier(0.4, 0, 1, 1)",
  "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
};

type AnimateCall = [Keyframe[], KeyframeAnimationOptions];

/** An element with the theme's tokens and an `animate` that records its calls and ends at once. */
function animatable(tag = "div"): { element: HTMLElement; calls: AnimateCall[] } {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(TOKENS)) {
    element.style.setProperty(name, value);
  }
  const calls: AnimateCall[] = [];
  element.animate = (keyframes, timing) => {
    calls.push([keyframes as Keyframe[], timing as KeyframeAnimationOptions]);
    return { finished: Promise.resolve() } as unknown as Animation;
  };
  return { element, calls };
}

function preferReducedMotion(reduced: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query === "(prefers-reduced-motion: reduce)",
  }));
}

/** A row whose box is at `top` until `moveTo` changes it, as a layout would after a change. */
function row(top: number): {
  element: HTMLElement;
  calls: AnimateCall[];
  moveTo: (next: number) => void;
} {
  const { element, calls } = animatable("li");
  let current = top;
  element.getBoundingClientRect = () => ({ left: 0, top: current }) as DOMRect;
  return {
    element,
    calls,
    moveTo: (next) => {
      current = next;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

verifies("kit.motion", () => {
  describe("enter", () => {
    it("fades in and rises --motion-rise over --duration-base with --ease-enter", async () => {
      const { element, calls } = animatable();
      await enter(element);
      expect(calls).toEqual([
        [
          [
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 200, easing: TOKENS["--ease-enter"] },
        ],
      ]);
    });

    it("drops from above, or only fades, as asked", async () => {
      const dropping = animatable();
      await enter(dropping.element, { move: "drop" });
      expect(dropping.calls[0]?.[0][0]).toEqual({ opacity: 0, transform: "translateY(-8px)" });
      const fading = animatable();
      await enter(fading.element, { move: "none" });
      expect(fading.calls[0]?.[0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    });

    it("only fades over --duration-fast with reduced motion", async () => {
      preferReducedMotion(true);
      const { element, calls } = animatable();
      await enter(element, { move: "drop" });
      expect(calls).toEqual([
        [[{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: TOKENS["--ease-enter"] }],
      ]);
    });
  });

  describe("leave", () => {
    it("fades out over --duration-fast with --ease-exit and stays faded", async () => {
      const { element, calls } = animatable();
      await leave(element);
      expect(calls).toEqual([
        [
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 120, easing: TOKENS["--ease-exit"], fill: "forwards" },
        ],
      ]);
    });

    it("still fades with reduced motion, since a fade moves nothing", async () => {
      preferReducedMotion(true);
      const { element, calls } = animatable();
      await leave(element);
      expect(calls[0]?.[0]).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    });
  });

  describe("flip", () => {
    function listOfThree() {
      const { element: list } = animatable("ul");
      const rows = [row(0), row(40), row(80)];
      for (const each of rows) {
        list.append(each.element);
      }
      return { list, rows };
    }

    it("glides rows that moved from their old place over --duration-base with --ease-standard", async () => {
      const { list, rows } = listOfThree();
      const [first, second, third] = rows;
      const added = row(0);
      await flip(list, () => {
        list.prepend(added.element);
        first?.moveTo(40);
        second?.moveTo(80);
        third?.moveTo(120);
      });
      expect(first?.calls).toEqual([
        [
          [{ transform: "translate(0px, -40px)" }, { transform: "translate(0, 0)" }],
          { duration: 200, easing: TOKENS["--ease-standard"] },
        ],
      ]);
      expect(third?.calls[0]?.[0][0]).toEqual({ transform: "translate(0px, -40px)" });
      expect(added.calls).toEqual([]);
    });

    it("leaves rows that didn't move alone", async () => {
      const { list, rows } = listOfThree();
      const [first, second, third] = rows;
      await flip(list, () => {
        second?.element.remove();
        third?.moveTo(40);
      });
      expect(first?.calls).toEqual([]);
      expect(third?.calls[0]?.[0][0]).toEqual({ transform: "translate(0px, 40px)" });
    });

    it("makes the change without a glide with reduced motion", async () => {
      preferReducedMotion(true);
      const { list, rows } = listOfThree();
      const change = vi.fn(() => rows[2]?.moveTo(0));
      await flip(list, change);
      expect(change).toHaveBeenCalledOnce();
      expect(rows.flatMap((each) => each.calls)).toEqual([]);
    });
  });

  describe("swap", () => {
    it("renders at once, then fades in and slides --motion-slide from the end going in", async () => {
      const { element, calls } = animatable();
      await swap(element, () => element.replaceChildren("Chief"), "in");
      expect(element.textContent).toBe("Chief");
      expect(calls).toEqual([
        [
          [
            { opacity: 0, transform: "translateX(24px)" },
            { opacity: 1, transform: "translateX(0)" },
          ],
          { duration: 200, easing: TOKENS["--ease-enter"] },
        ],
      ]);
    });

    it("slides from the start going back, and mirrors right to left", async () => {
      const back = animatable();
      await swap(back.element, () => undefined, "back");
      expect(back.calls[0]?.[0][0]).toEqual({ opacity: 0, transform: "translateX(-24px)" });
      const rightToLeft = animatable();
      rightToLeft.element.style.direction = "rtl";
      await swap(rightToLeft.element, () => undefined, "in");
      expect(rightToLeft.calls[0]?.[0][0]).toEqual({ opacity: 0, transform: "translateX(-24px)" });
    });

    it("only fades when the pane didn't move", async () => {
      const { element, calls } = animatable();
      await swap(element, () => undefined);
      expect(calls[0]?.[0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    });

    it("only fades over --duration-fast with reduced motion", async () => {
      preferReducedMotion(true);
      const { element, calls } = animatable();
      await swap(element, () => undefined, "in");
      expect(calls).toEqual([
        [[{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: TOKENS["--ease-enter"] }],
      ]);
    });
  });

  describe("where an element can't animate", () => {
    it("only makes the change", async () => {
      const element = document.createElement("div");
      expect(typeof element.animate).not.toBe("function");
      const change = vi.fn();
      await enter(element);
      await leave(element);
      await flip(element, change);
      await swap(element, change, "in");
      expect(change).toHaveBeenCalledTimes(2);
    });
  });

  describe("a motion that's cancelled", () => {
    it("resolves, since nothing went wrong", async () => {
      const { element } = animatable();
      element.animate = () =>
        ({
          finished: Promise.reject(new DOMException("The animation was cancelled.", "AbortError")),
        }) as unknown as Animation;
      await expect(enter(element)).resolves.toBeUndefined();
    });

    it("but any other failure rejects", async () => {
      const { element } = animatable();
      element.animate = () =>
        ({ finished: Promise.reject(new Error("broken")) }) as unknown as Animation;
      await expect(leave(element)).rejects.toThrow("broken");
    });
  });
});
