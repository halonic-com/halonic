// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import type { ReactElement } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { HalonicMark } from "./halonic-mark.tsx";

afterEach(() => {
  unmountAll();
});

const markOf = (element: ReactElement) =>
  render(element).container.querySelector("svg") as SVGSVGElement;

verifies("kit.halonic-mark", () => {
  it("is hidden and 20px without a label", () => {
    const mark = markOf(<HalonicMark />);
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.getAttribute("role")).toBeNull();
    expect(mark.getAttribute("class")).toBe("shrink-0 size-icon-md");
  });

  it("is an image with its label's name, at the size it's given", () => {
    const mark = markOf(<HalonicMark label="Halonic Studio" className="size-8" />);
    expect(mark.getAttribute("role")).toBe("img");
    expect(mark.getAttribute("aria-label")).toBe("Halonic Studio");
    expect(mark.getAttribute("aria-hidden")).toBeNull();
    expect(mark.getAttribute("class")).toBe("shrink-0 size-8");
  });

  it("points the ring at its own gradient, and two marks never share an id", () => {
    const ids = [markOf(<HalonicMark />), markOf(<HalonicMark />)].map((mark) => {
      const id = mark.querySelector("linearGradient")?.getAttribute("id");
      expect(mark.querySelector("circle")?.getAttribute("stroke")).toBe(`url(#${id})`);
      return id;
    });
    expect(ids[0]).not.toBe(ids[1]);
  });
});
