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
});
