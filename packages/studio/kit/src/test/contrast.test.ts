import { describe, expect, it } from "vitest";
import { blend, contrastRatio, parseColour } from "./contrast.ts";

describe("contrastRatio", () => {
  it("gives the WCAG extremes for black and white", () => {
    expect(contrastRatio(parseColour("#000000"), parseColour("#ffffff"))).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColour("#ffffff"), parseColour("#ffffff"))).toBe(1);
  });

  it("matches a known value", () => {
    // #767676 on white is the classic "just passes AA" grey.
    expect(contrastRatio(parseColour("#767676"), parseColour("#ffffff"))).toBeCloseTo(4.54, 2);
  });

  it("blends a see-through colour onto its background first", () => {
    const halfBlack = parseColour("rgb(0 0 0 / 0.5)");
    expect(blend(halfBlack, parseColour("#ffffff"))).toEqual({
      red: 127.5,
      green: 127.5,
      blue: 127.5,
      alpha: 1,
    });
  });

  it("reads color-mix() with transparent as the colour at that alpha", () => {
    const halfBlack = parseColour("color-mix(in srgb, #000000 50%, transparent)");
    expect(blend(halfBlack, parseColour("#ffffff"))).toEqual({
      red: 127.5,
      green: 127.5,
      blue: 127.5,
      alpha: 1,
    });
  });

  it("refuses colour forms the theme doesn't use", () => {
    expect(() => parseColour("red")).toThrow(/Can't read the colour/);
    expect(() => parseColour("color-mix(in srgb, #000000 50%, #ffffff)")).toThrow(
      /Can't read the colour/,
    );
    expect(() => parseColour("color-mix(in oklch, #000000 50%, transparent)")).toThrow(
      /Can't read the colour/,
    );
  });
});
