// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { SectionIcon, sectionIconNames } from "./section-icon.tsx";

afterEach(() => {
  unmountAll();
});

verifies("kit.section-icon", () => {
  it.each(sectionIconNames)("draws the %s outline in the text colour, hidden", (name) => {
    const svg = render(<SectionIcon name={name} />).container.querySelector("svg") as SVGSVGElement;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("stroke-width")).toBe("1.8");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("draws a path of its own for every section", () => {
    const paths = sectionIconNames.map((name) =>
      render(<SectionIcon name={name} />)
        .container.querySelector("path")
        ?.getAttribute("d"),
    );
    expect(new Set(paths).size).toBe(sectionIconNames.length);
  });
});
