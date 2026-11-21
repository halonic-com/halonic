import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fitScale, MIN_FIT_SCALE, mapLines, PHONE_MIN_FIT_SCALE } from "./map-geometry.ts";

const centre = { x: 400, y: 100, width: 200, height: 120 };
const card = (x: number, y: number) => ({ x, y, width: 160, height: 40 });

verifies("agents.map.lines-and-fit", () => {
  it("never scales a map that fits above its natural size", () => {
    expect(fitScale({ width: 900, height: 400 }, { width: 1400, height: 900 })).toBe(1);
  });

  it("shrinks a map to the panel's narrower side on the desktop, down to 0.8 of its size", () => {
    expect(MIN_FIT_SCALE).toBe(0.8);
    expect(fitScale({ width: 900, height: 400 }, { width: 810, height: 900 })).toBe(0.9);
    expect(fitScale({ width: 900, height: 400 }, { width: 900, height: 340 })).toBe(0.85);
    expect(fitScale({ width: 900, height: 400 }, { width: 600, height: 900 })).toBe(0.8);
    expect(fitScale({ width: 900, height: 400 }, { width: 300, height: 900 })).toBe(0.8);
  });

  it("never shrinks a map on a phone", () => {
    expect(PHONE_MIN_FIT_SCALE).toBe(1);
    expect(
      fitScale({ width: 900, height: 400 }, { width: 390, height: 700 }, PHONE_MIN_FIT_SCALE),
    ).toBe(1);
    expect(
      fitScale({ width: 900, height: 400 }, { width: 1400, height: 900 }, PHONE_MIN_FIT_SCALE),
    ).toBe(1);
  });

  it("leaves a map that isn't measured at its natural size", () => {
    expect(fitScale({ width: 0, height: 0 }, { width: 600, height: 400 })).toBe(1);
    expect(fitScale({ width: 900, height: 400 }, { width: 0, height: 0 })).toBe(1);
  });

  it("joins a card on the left from its right edge to the centre card's left edge", () => {
    const [line] = mapLines(centre, { in: [card(0, 140)], use: [], out: [] });
    expect(line?.from).toEqual({ x: 160, y: 160 });
    expect(line?.to).toEqual({ x: 400, y: 160 });
    // Ports in line: one straight segment.
    expect(line?.path).toBe("M 160 160 H 280 V 160 H 400");
  });

  it("gives every line its own port on the centre card, spread along the facing edge", () => {
    const lines = mapLines(centre, { in: [card(0, 0), card(0, 200)], use: [], out: [] });
    expect(lines.map((line) => line.to)).toEqual([
      { x: 400, y: 140 },
      { x: 400, y: 180 },
    ]);
    // Straight out of the card's right edge, a square turn halfway, straight into the centre's port.
    expect(lines.map((line) => line.path)).toEqual([
      "M 160 20 H 280 V 140 H 400",
      "M 160 220 H 280 V 180 H 400",
    ]);
  });

  it("joins cards below from the centre's bottom edge to their top, and on the right to their left edge", () => {
    const lines = mapLines(centre, { in: [], use: [card(420, 300)], out: [card(800, 140)] });
    expect(lines.map((line) => [line.from, line.to])).toEqual([
      [
        { x: 500, y: 220 },
        { x: 500, y: 300 },
      ],
      [
        { x: 600, y: 160 },
        { x: 800, y: 160 },
      ],
    ]);
    expect(lines[0]?.path).toBe("M 500 220 V 260 H 500 V 300");
    expect(lines[1]?.path).toBe("M 600 160 H 700 V 160 H 800");
  });

  it("turns a line below at square corners halfway down when the card is off to the side", () => {
    const [line] = mapLines(centre, { in: [], use: [card(600, 300)], out: [] });
    expect(line?.path).toBe("M 500 220 V 260 H 680 V 300");
  });
});
