/** A point on the map, in its own pixels (before the fit scales it). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A card's place and size on the map. */
export interface Box extends Point {
  readonly width: number;
  readonly height: number;
}

/** Which side of the centre card a card is on: what brings it work, what it can use, who it hands work to. */
export type MapSide = "in" | "use" | "out";

/** One line of the map: from a side card's port to the centre card's, or the other way round. */
export interface MapLine {
  readonly from: Point;
  readonly to: Point;
  /**
   * The line's path: straight out from the first port's edge, a square turn halfway, and straight
   * into the second port (flow-agents 6, T12; HAL-15064). Ports in line make one straight segment.
   */
  readonly path: string;
}

/**
 * The least the fit shrinks the map to on the desktop: its 12 px captions stay about 10 px. Smaller,
 * the panel scrolls instead.
 */
export const MIN_FIT_SCALE = 0.8;

/**
 * The least on the phone presentation (narrower than 600 px, a 640 px window at 200 % zoom too):
 * the map keeps its natural size and the panel scrolls, so a zoom isn't undone and its buttons
 * stay 24 px or more (WCAG 1.4.4, 2.5.8).
 */
export const PHONE_MIN_FIT_SCALE = 1;

/** How long after the last resize the map fits again, like the workflow canvas. */
export const FIT_DELAY_MS = 260;

/**
 * The scale that fits `content` into `room`: never above 1, so a small map isn't blown up, and
 * never below `floor` ({@link MIN_FIT_SCALE}, or {@link PHONE_MIN_FIT_SCALE} on a phone). 1 while
 * either isn't measured (a test without a layout).
 */
export function fitScale(
  content: { readonly width: number; readonly height: number },
  room: { readonly width: number; readonly height: number },
  floor: number = MIN_FIT_SCALE,
): number {
  if (content.width <= 0 || content.height <= 0 || room.width <= 0 || room.height <= 0) return 1;
  const scale = Math.min(1, room.width / content.width, room.height / content.height);
  return Math.max(floor, scale);
}

/**
 * The lines from each side's cards to the centre card (flow-agents 6, T12): a card on the left
 * joins the centre's left edge from its right edge, one on the right its right edge from its left
 * edge, one below its bottom edge from its top. The centre card has a port for every line, spread
 * evenly along the facing edge in the cards' order, so no two lines share one.
 */
export function mapLines(
  centre: Box,
  sides: Readonly<Record<MapSide, readonly Box[]>>,
): readonly MapLine[] {
  const spread = (count: number, index: number) => (index + 1) / (count + 1);
  const across = (from: Point, to: Point): MapLine => {
    const middle = (from.x + to.x) / 2;
    return { from, to, path: `M ${from.x} ${from.y} H ${middle} V ${to.y} H ${to.x}` };
  };
  const down = (from: Point, to: Point): MapLine => {
    const middle = (from.y + to.y) / 2;
    return { from, to, path: `M ${from.x} ${from.y} V ${middle} H ${to.x} V ${to.y}` };
  };
  return [
    ...sides.in.map((card, index) =>
      across(
        { x: card.x + card.width, y: card.y + card.height / 2 },
        { x: centre.x, y: centre.y + centre.height * spread(sides.in.length, index) },
      ),
    ),
    ...sides.use.map((card, index) =>
      down(
        {
          x: centre.x + centre.width * spread(sides.use.length, index),
          y: centre.y + centre.height,
        },
        { x: card.x + card.width / 2, y: card.y },
      ),
    ),
    ...sides.out.map((card, index) =>
      across(
        {
          x: centre.x + centre.width,
          y: centre.y + centre.height * spread(sides.out.length, index),
        },
        { x: card.x, y: card.y + card.height / 2 },
      ),
    ),
  ];
}
