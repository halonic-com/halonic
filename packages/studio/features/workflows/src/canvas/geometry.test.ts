import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  boundsOf,
  CARD_SIZE,
  fitView,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  panToShow,
  zoomAround,
} from "./geometry.ts";

const card = (x: number, y: number) => ({ x, y, ...CARD_SIZE });
const screen = (view: ReturnType<typeof fitView>, x: number, y: number) => ({
  x: x * view.zoom + view.pan.x,
  y: y * view.zoom + view.pan.y,
});

verifies("workflows.canvas.fit-and-zoom", () => {
  it("leaves the zoom at 100 % and centres cards that fit", () => {
    const view = fitView(boundsOf([card(0, 0), card(0, 136)]), { width: 800, height: 600 });
    expect(view.zoom).toBe(1);
    expect(screen(view, 0, 0).x + CARD_SIZE.width / 2).toBe(400);
  });

  it("zooms out until wide content shows, with room round it", () => {
    const content = { x: 0, y: 0, width: 1600, height: 100 };
    const view = fitView(content, { width: 800, height: 600 });
    expect(view.zoom).toBe(0.46);
    expect(screen(view, 0, 0).x).toBeCloseTo(32);
    expect(screen(view, 1600, 0).x).toBeCloseTo(768);
  });

  it("doesn't blow one card up past 100 %", () => {
    expect(fitView(boundsOf([card(0, 0)]), { width: 4000, height: 3000 }).zoom).toBe(1);
  });

  it("shows 100 % at the top left when there are no steps", () => {
    expect(fitView(boundsOf([]), { width: 800, height: 600 })).toEqual({
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
  });

  it("keeps the point under the pointer where it is when zooming in", () => {
    const before = { zoom: 1, pan: { x: 10, y: 20 } };
    const anchor = { x: 300, y: 200 };
    const after = zoomAround(before, 1.5, anchor);
    expect(after.zoom).toBe(1.5);
    const canvasPoint = { x: (anchor.x - 10) / 1, y: (anchor.y - 20) / 1 };
    expect(screen(after, canvasPoint.x, canvasPoint.y)).toEqual(anchor);
  });

  it("stops zooming out at 25 %", () => {
    let view = { zoom: 1, pan: { x: 0, y: 0 } };
    for (let i = 0; i < 20; i++) view = zoomAround(view, 0.5, { x: 0, y: 0 });
    expect(view.zoom).toBe(MIN_ZOOM);
  });

  it("stops zooming in at 200 %", () => {
    let view = { zoom: 1, pan: { x: 0, y: 0 } };
    for (let i = 0; i < 20; i++) view = zoomAround(view, 2, { x: 0, y: 0 });
    expect(view.zoom).toBe(MAX_ZOOM);
  });

  it("pans by the pixels dragged", () => {
    expect(panBy({ zoom: 2, pan: { x: 1, y: 2 } }, { x: 5, y: -3 })).toEqual({
      zoom: 2,
      pan: { x: 6, y: -1 },
    });
  });
});

verifies("workflows.canvas.focus-in-view", () => {
  // At 200 %, in an 800 × 600 canvas whose left 56 pixels the zoom buttons take.
  const zoomed = { zoom: 2, pan: { x: 0, y: 0 } };
  const room = { x: 56, y: 0, width: 744, height: 600 };
  /** Where `box` shows on screen in `view`: its top-left and bottom-right corners. */
  const shown = (view: typeof zoomed, box: ReturnType<typeof card>) => ({
    topLeft: screen(view, box.x, box.y),
    bottomRight: screen(view, box.x + box.width, box.y + box.height),
  });

  it("pans a card above the view down until its top is 16 pixels in", () => {
    const above = card(100, -200);
    const view = panToShow(zoomed, above, room);
    expect(shown(view, above).topLeft).toEqual({ x: 200, y: 16 });
    expect(view.zoom).toBe(2);
  });

  it("pans a card below the view up until its bottom is 16 pixels in", () => {
    const below = card(100, 400);
    expect(shown(panToShow(zoomed, below, room), below).bottomRight.y).toBe(584);
  });

  it("pans a card left of the view clear of the zoom buttons", () => {
    const left = card(-100, 100);
    expect(shown(panToShow(zoomed, left, room), left).topLeft.x).toBe(72);
  });

  it("pans a card right of the view until its right edge is 16 pixels in", () => {
    const right = card(300, 100);
    expect(shown(panToShow(zoomed, right, room), right).bottomRight.x).toBe(784);
  });

  it("leaves the view as it is for a card that already shows", () => {
    expect(panToShow(zoomed, card(50, 50), room)).toBe(zoomed);
  });

  it("lines up the top-left corner of a card bigger than the view", () => {
    const small = { x: 56, y: 0, width: 300, height: 100 };
    const big = card(100, 100);
    expect(shown(panToShow(zoomed, big, small), big).topLeft).toEqual({ x: 72, y: 16 });
  });
});
