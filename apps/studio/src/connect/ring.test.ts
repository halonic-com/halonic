import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs each package's tests from the package folder (see colours.test.ts).
const connectPage = readFileSync(join(process.cwd(), "connect.html"), "utf8");
const titleBarBrand = readFileSync(
  join(process.cwd(), "../../packages/studio/shell/src/title-bar/title-bar-brand.tsx"),
  "utf8",
);

/** Pulls `name="value"` or `name=value` out of the first element of `tag` in some markup. */
function attribute(markup: string, tag: string, name: string): string | undefined {
  const element = new RegExp(`<${tag}\\b[^>]*>`).exec(markup)?.[0] ?? "";
  const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return new RegExp(`(?:${name}|${kebab})="([^"]*)"`).exec(element)?.[1];
}

/** The ring as both places draw it: band, gradient direction and the two stops. */
function ring(markup: string) {
  return {
    circle: ["cx", "cy", "r", "strokeWidth"].map((name) => attribute(markup, "circle", name)),
    direction: ["x1", "y1", "x2", "y2"].map((name) => attribute(markup, "linearGradient", name)),
    stops: [...markup.matchAll(/<stop\b[^>]*>/g)].map(
      (stop) => /(?:stop-color|stopColor)="([^"]*)"/.exec(stop[0])?.[1],
    ),
  };
}

describe("the ring on the connect page and in the Studio's title bar", () => {
  it("draws the ring once on the connect page and uses it on both screens", () => {
    expect(connectPage.match(/<circle\b/g)).toHaveLength(1);
    expect(connectPage.match(/<use href="#ring"/g)).toHaveLength(2);
  });

  it("has a band of 16% of the diameter and one gradient from blue to cyan, bottom left to top right", () => {
    for (const markup of [connectPage, titleBarBrand]) {
      expect(ring(markup)).toEqual({
        circle: ["50", "50", "42", "16"],
        direction: ["0", "1", "1", "0"],
        stops: ["#3175f2", "#1bc6c8"],
      });
    }
  });

  it("uses no pixel stroke and no non-scaling stroke", () => {
    for (const markup of [connectPage, titleBarBrand]) {
      expect(markup).not.toMatch(/non-scaling-stroke|vectorEffect|stroke-width="\d+px"/);
    }
  });
});
