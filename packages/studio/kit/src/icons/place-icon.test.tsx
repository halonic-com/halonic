// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { PlaceIcon, placeIconNames } from "./place-icon.tsx";

afterEach(() => {
  unmountAll();
});

function svgOf(container: HTMLElement): SVGSVGElement {
  return container.querySelector("svg") as SVGSVGElement;
}

verifies("kit.place-icon", () => {
  it("names an icon for each of the sidebar's places, in their order", () => {
    expect(placeIconNames).toEqual([
      "home",
      "inbox",
      "agents",
      "workflows",
      "routines",
      "library",
      "runs",
      "changes",
    ]);
  });

  it.each(placeIconNames)("draws the %s outline in the text colour, hidden", (name) => {
    const svg = svgOf(render(<PlaceIcon name={name} />).container);

    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("stroke-width")).toBe("1.8");
    expect(svg.getAttribute("data-place-icon")).toBe(name);
    expect(svg.querySelector("path")?.getAttribute("fill")).toBe("none");
    expect(svg.querySelector("mask")).toBeNull();
  });

  it.each(placeIconNames)("draws the %s icon filled in the text colour", (name) => {
    const svg = svgOf(render(<PlaceIcon name={name} filled />).container);

    expect(svg.getAttribute("data-place-icon")).toBe(`${name}-filled`);
    expect(svg.querySelector("g > path")?.getAttribute("fill")).toBe("currentColor");
  });

  it("knocks a filled icon's inner details out with a mask", () => {
    const svg = svgOf(render(<PlaceIcon name="inbox" filled />).container);
    const mask = svg.querySelector("mask") as SVGMaskElement;

    expect(svg.querySelector("g")?.getAttribute("mask")).toBe(`url(#${mask.id})`);
    expect(mask.querySelectorAll("path")).toHaveLength(1);
  });

  it("keeps Workflows' connecting line a line when filled, with nothing knocked out", () => {
    const svg = svgOf(render(<PlaceIcon name="workflows" filled />).container);

    expect(svg.querySelector("mask")).toBeNull();
    expect([...svg.querySelectorAll("g > path")].map((path) => path.getAttribute("fill"))).toEqual([
      "currentColor",
      "none",
    ]);
  });

  it("gives two filled icons on one page their own masks", () => {
    const { container } = render(
      <>
        <PlaceIcon name="runs" filled />
        <PlaceIcon name="runs" filled />
      </>,
    );
    const ids = [...container.querySelectorAll("mask")].map((mask) => mask.id);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
