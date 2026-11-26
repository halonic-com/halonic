// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { AddReactionIcon } from "./add-reaction-icon.tsx";

afterEach(() => {
  unmountAll();
});

verifies("kit.add-reaction-icon", () => {
  it("draws a hidden outline in the text colour on the place icons' grid and line", () => {
    const svg = render(<AddReactionIcon />).container.querySelector("svg");

    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("stroke-width")).toBe("1.8");
  });

  it("draws the face's open ring, two eyes, the smile and the + as its six lines", () => {
    const svg = render(<AddReactionIcon />).container.querySelector("svg");

    expect(svg?.querySelectorAll("path")).toHaveLength(6);
  });

  it("leaves a gap in the ring where the + sits, wider than the line, so the ring never closes", () => {
    const paths = render(<AddReactionIcon />).container.querySelectorAll("path");
    const ring = Array.from(paths, (path) => path.getAttribute("d") ?? "").find((d) =>
      d.includes("a8 8"),
    );
    const commands = ring?.replace(/[^a-zA-Z]/g, "");
    const numbers = (ring?.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    // "M x y a rx ry rotation large-arc sweep dx dy": a single arc ends dx, dy from where it starts.
    const gap = Math.hypot(numbers[7] ?? 0, numbers[8] ?? 0);

    // One move and one arc, with no close and no second arc that could bring the ring back round.
    expect(commands).toBe("Ma");
    // Round caps reach half the 1.8 line past each end, so a gap under 1.8 would look closed.
    expect(gap).toBeGreaterThan(1.8);
  });
});
