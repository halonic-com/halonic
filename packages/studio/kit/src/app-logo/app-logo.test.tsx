// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { type AppLogoId, appGlyphScale, appLogoIds } from "./app-glyphs.ts";
import { AppLogo } from "./app-logo.tsx";

afterEach(() => {
  unmountAll();
});

const glyphOf = (app: AppLogoId, pixels = 20) => {
  const svg = render(<AppLogo app={app} pixels={pixels} />).container.querySelector("svg");
  return svg?.querySelector(`[data-app-glyph="${app}"]`) as SVGGElement;
};

/** What a glyph is drawn from: a disc's centre and radius, or a path's outline. */
const shapesOf = (glyph: SVGGElement) =>
  [...glyph.children].map((shape) =>
    shape.tagName === "circle"
      ? `dot r${shape.getAttribute("r")}`
      : `${shape.getAttribute("fill") === "none" ? "line" : "solid"} ${shape.getAttribute("d")}`,
  );

verifies("kit.app-logo", () => {
  describe("each app's glyph", () => {
    const expected: Record<AppLogoId, readonly string[]> = {
      // The point of light.
      studio: ["dot r7"],
      // The bubble, its tail at the bottom left.
      messenger: [expect.stringMatching(/^solid M42 36\.25 H58 .* L38\.5 64\.75 .*Z$/)],
      // The tray's outline and its notched floor.
      inbox: [
        expect.stringMatching(/^line M39 37 H61 .*Z$/),
        "solid M37.25 52 H43 L45.75 57.25 H54.25 L57 52 H62.75 V60.75 H37.25 Z",
      ],
      // A diamond layer over a chevron.
      workspaces: [
        "solid M36.5 43.5 L50 36.25 L63.5 43.5 L50 50.75 Z",
        "line M35 52.5 L50 60.75 L65 52.5",
      ],
      // Two brackets.
      code: ["line M42 38 L33 50 L42 62 M58 38 L67 50 L58 62"],
      // The teaser's play shape.
      runs: ["solid M42 35.5 L66 50 L42 64.5 Z"],
      // A question mark's hook and its dot.
      ask: [expect.stringMatching(/^line M42 41\.5 C42 36\.5 .* V55$/), "dot r4.6"],
    };

    it("covers every app", () => {
      expect(Object.keys(expected)).toEqual([...appLogoIds]);
    });

    it.each(appLogoIds)("draws %s's own glyph in the ring", (app) => {
      expect(shapesOf(glyphOf(app))).toEqual(expected[app]);
    });

    it("never draws two apps alike", () => {
      const drawn = appLogoIds.map((app) => shapesOf(glyphOf(app)).join(" | "));
      expect(new Set(drawn).size).toBe(appLogoIds.length);
    });
  });

  it("draws the glyph in the text colour, inside the brand ring", () => {
    const svg = render(<AppLogo app="code" />).container.querySelector("svg") as SVGSVGElement;
    const glyph = svg.querySelector("[data-app-glyph]") as SVGGElement;
    expect(glyph.getAttribute("class")).toBe("text-fg");
    expect(glyph.querySelector("path")?.getAttribute("stroke")).toBe("currentColor");
    const ring = svg.querySelector("circle") as SVGCircleElement;
    expect(ring.getAttribute("stroke")).toMatch(/^url\(#/);
  });

  it.each([
    [16, 1.4],
    [20, 1.4],
    [24, 1.4],
    [32, 1.2],
    [48, 1],
    [256, 1],
  ])("grows the glyph at %ipx to %f times", (pixels, scale) => {
    expect(appGlyphScale(pixels)).toBe(scale);
    expect(glyphOf("runs", pixels).getAttribute("transform")).toBe(
      `translate(50 50) scale(${scale}) translate(-50 -50)`,
    );
  });

  it("is hidden without a label, and an image with its label's name", () => {
    const hidden = render(<AppLogo app="inbox" />).container.querySelector("svg");
    expect(hidden?.getAttribute("aria-hidden")).toBe("true");
    const named = render(<AppLogo app="inbox" label="Halonic Inbox" />).container.querySelector(
      "svg",
    );
    expect(named?.getAttribute("role")).toBe("img");
    expect(named?.getAttribute("aria-label")).toBe("Halonic Inbox");
  });
});
