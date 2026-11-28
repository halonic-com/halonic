import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  chosenRailDotMotion,
  type RailDotMotion,
  type RailDotTokens,
  railDotMotionAttribute,
  railDotMotions,
  railDotSteps,
} from "./rail-dot-motion.ts";

/** The theme's values (`kit.rail-dot-tokens`). */
const tokens: RailDotTokens = {
  easeDot: "cubic-bezier(0.25, 1, 0.5, 1)",
  easeRing: "cubic-bezier(0.33, 1, 0.68, 1)",
  lead: 360,
  streak: 400,
  ring: 500,
  fade: 150,
};

const home = { x: 32, y: 28 };
const inbox = { x: 32, y: 172 };

function steps(motion: RailDotMotion, reduced = false) {
  return railDotSteps({ motion, from: home, to: inbox, reduced, tokens });
}

/** The `scale` keyframes of the dot's shape, in order. */
function shape(motion: RailDotMotion): unknown[] {
  return steps(motion)[1]?.keyframes.map(({ scale }) => scale) ?? [];
}

/** A root element that names `value` as the motion; none when `value` is left out. */
function root(value?: string): Element {
  return {
    getAttribute: (name: string) => (name === railDotMotionAttribute ? value : null),
  } as Element;
}

verifies("shell.rail-dot", () => {
  describe("the motion the window names", () => {
    it("lists Lead first, then Streak and Pulse", () => {
      expect(railDotMotions).toEqual(["lead", "streak", "pulse"]);
      expect(railDotMotionAttribute).toBe("data-rail-dot-motion");
    });

    it.each(railDotMotions)("reads %s from the root element", (motion) => {
      expect(chosenRailDotMotion(root(motion))).toBe(motion);
    });

    it.each([undefined, "", "sparkle", "Lead"])("plays Lead for %j", (value) => {
      expect(chosenRailDotMotion(root(value))).toBe("lead");
    });
  });

  describe("Lead", () => {
    it("moves only the dot, from the old point to where it rests, on the dot's curve", () => {
      const [position, ...others] = steps("lead");
      expect(position).toEqual({
        part: "dot",
        keyframes: [{ translate: "0px -144px" }, { translate: "0px 0px" }],
        timing: { duration: 360, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
      });
      expect(others.map((step) => step.part)).toEqual(["dot"]);
    });

    it("thins and stretches the dot a little on a linear clock, round at both ends", () => {
      expect(steps("lead")[1]?.timing).toEqual({ duration: 360, easing: "linear" });
      expect(shape("lead")).toEqual([
        "1 1",
        "0.85 1.16",
        "0.75 1.27",
        "0.69 1.34",
        "0.67 1.36",
        "0.69 1.34",
        "0.75 1.27",
        "0.85 1.16",
        "1 1",
      ]);
    });

    it("only fades with reduced motion: out on the old icon, in on the new one, in 150ms", () => {
      expect(steps("lead", true)).toEqual([
        {
          part: "dot",
          keyframes: [
            { opacity: 1, translate: "0px -144px", offset: 0 },
            { opacity: 0, translate: "0px -144px", offset: 0.5 },
            { opacity: 0, translate: "0px 0px", offset: 0.5 },
            { opacity: 1, translate: "0px 0px", offset: 1 },
          ],
          timing: { duration: 150, easing: "linear" },
        },
      ]);
    });
  });
});

verifies("shell.rail-dot-streak", () => {
  describe("Streak", () => {
    it("travels in 400ms on the dot's curve", () => {
      const [position, stretch, ...others] = steps("streak");
      expect(position?.timing).toEqual({ duration: 400, easing: "cubic-bezier(0.25, 1, 0.5, 1)" });
      expect(position?.keyframes).toEqual([{ translate: "0px -144px" }, { translate: "0px 0px" }]);
      expect(stretch?.timing).toEqual({ duration: 400, easing: "linear" });
      expect(others).toEqual([]);
    });

    it("stretches into the 31px line at the middle and gathers again", () => {
      expect(shape("streak")).toEqual([
        "1 1",
        "0.55 2.75",
        "0.42 4.05",
        "0.36 4.84",
        "0.35 5.1",
        "0.36 4.84",
        "0.42 4.05",
        "0.55 2.75",
        "1 1",
      ]);
    });

    it("fades as Lead with reduced motion and doesn't stretch", () => {
      expect(steps("streak", true)).toEqual(steps("lead", true));
      expect(steps("streak", true).some((step) => "scale" in (step.keyframes[0] ?? {}))).toBe(
        false,
      );
    });
  });
});

verifies("shell.rail-dot-pulse", () => {
  describe("Pulse", () => {
    it("moves the dot exactly as Lead", () => {
      expect(steps("pulse").slice(0, 2)).toEqual(steps("lead"));
    });

    it("opens the ring as the dot lands: 252ms in, for 500ms, hidden before and after", () => {
      const [grow, dim, ...others] = steps("pulse").slice(2);
      // Not `both`: filling backwards would show the ring while it waits for the dot.
      const timing = { duration: 500, delay: 252, fill: "forwards" };
      expect(grow).toEqual({
        part: "ring",
        keyframes: [{ scale: "0.7" }, { scale: "1.45" }],
        timing: { ...timing, easing: "cubic-bezier(0.33, 1, 0.68, 1)" },
      });
      expect(dim).toEqual({
        part: "ring",
        keyframes: [{ opacity: 0.7 }, { opacity: 0 }],
        timing: { ...timing, easing: "linear" },
      });
      expect(others).toEqual([]);
    });

    it("opens no ring with reduced motion; the dot fades as Lead", () => {
      expect(steps("pulse", true)).toEqual(steps("lead", true));
      expect(steps("pulse", true).some((step) => step.part === "ring")).toBe(false);
    });
  });
});
