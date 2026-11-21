import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fitScale, mapLines } from "./map-geometry.ts";

const centre = { x: 400, y: 100, width: 200, height: 120 };
const card = (x: number, y: number) => ({ x, y, width: 160, height: 40 });

verifies("agents.map.lines-and-fit", () => {
  it("never scales a map that fits above its natural size", () => {
    expect(fitScale({ width: 900, height: 400 }, { width: 1400, height: 900 })).toBe(1);
  });

  it("shrinks a map to the panel's narrower side, down to half its size", () => {
    expect(fitScale({ width: 900, height: 400 }, { width: 600, height: 900 })).toBeCloseTo(2 / 3);
    expect(fitScale({ width: 900, height: 400 }, { width: 900, height: 300 })).toBe(0.75);
    expect(fitScale({ width: 900, height: 400 }, { width: 300, height: 900 })).toBe(0.5);
  });

  it("leaves a map that isn't measured at its natural size", () => {
    expect(fitScale({ width: 0, height: 0 }, { width: 600, height: 400 })).toBe(1);
    expect(fitScale({ width: 900, height: 400 }, { width: 0, height: 0 })).toBe(1);
  });

  it("joins a card on the left from its right edge to the centre card's left edge", () => {
    const [line] = mapLines(centre, { in: [card(0, 140)], use: [], out: [] });
    expect(line?.from).toEqual({ x: 160, y: 160 });
    expect(line?.to).toEqual({ x: 400, y: 160 });
    // The curve leaves and reaches each port straight out from its edge.
    expect(line?.path).toBe("M 160 160 C 280 160, 280 160, 400 160");
  });

  it("gives every line its own port on the centre card, spread along the facing edge", () => {
    const lines = mapLines(centre, { in: [card(0, 0), card(0, 200)], use: [], out: [] });
    expect(lines.map((line) => line.to)).toEqual([
      { x: 400, y: 140 },
      { x: 400, y: 180 },
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
    expect(lines[0]?.path).toBe("M 500 220 C 500 260, 500 260, 500 300");
  });
});
