import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { arrowShape } from "./arrow-path.ts";
import { CARD_SIZE } from "./geometry.ts";

const card = (x: number, y: number) => ({ x, y, ...CARD_SIZE });

verifies("workflows.canvas.arrows", () => {
  it("runs from the bottom edge to the top edge of a card below", () => {
    const shape = arrowShape(card(0, 0), card(0, 136));
    expect(shape.path.startsWith("M 100 72 ")).toBe(true);
    expect(shape.head).toEqual({ x: 100, y: 136 });
    expect(shape.headAngle).toBe(90);
  });

  it("loops round the right side for an arrow back up", () => {
    const shape = arrowShape(card(0, 136), card(0, 0));
    expect(shape.headAngle).toBe(180);
    expect(shape.head.x).toBe(CARD_SIZE.width);
    expect(shape.label.x).toBeGreaterThan(CARD_SIZE.width);
  });

  it("runs side to side between cards in the same row, in both directions", () => {
    const right = arrowShape(card(0, 0), card(300, 0));
    expect(right.path.startsWith("M 200 36 ")).toBe(true);
    expect(right.head).toEqual({ x: 300, y: 36 });
    expect(right.headAngle).toBe(0);
    expect(right.label).toEqual({ x: 250, y: 36 });
    const left = arrowShape(card(300, 0), card(0, 0));
    expect(left.path.startsWith("M 300 36 ")).toBe(true);
    expect(left.head).toEqual({ x: 200, y: 36 });
    expect(left.headAngle).toBe(180);
  });

  it("gives an arrow from a step to itself a visible curve", () => {
    const shape = arrowShape(card(0, 0), card(0, 0));
    expect(shape.head.y).toBeGreaterThan(CARD_SIZE.height * 0.35);
    expect(shape.label.x).toBeGreaterThan(CARD_SIZE.width);
  });

  it("puts the label of a loop on the curve", () => {
    expect(arrowShape(card(0, 0), card(0, 0)).label.x).toBe(236);
  });

  it("puts the label halfway along an arrow to the card below", () => {
    expect(arrowShape(card(0, 0), card(0, 136)).label).toEqual({ x: 100, y: 104 });
  });
});
