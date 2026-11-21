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
  /** The bezier's path, leaving and reaching each port straight out from its card's edge. */
  readonly path: string;
}

/** The least the fit shrinks the map to; smaller, its words can't be read, so the panel scrolls. */
export const MIN_FIT_SCALE = 0.5;

/** How long after the last resize the map fits again, like the workflow canvas. */
export const FIT_DELAY_MS = 260;

/**
 * The scale that fits `content` into `room`: never above 1, so a small map isn't blown up, and
 * never below {@link MIN_FIT_SCALE}. 1 while either isn't measured (a test without a layout).
 */
export function fitScale(
  content: { readonly width: number; readonly height: number },
  room: { readonly width: number; readonly height: number },
): number {
  if (content.width <= 0 || content.height <= 0 || room.width <= 0 || room.height <= 0) return 1;
  const scale = Math.min(1, room.width / content.width, room.height / content.height);
  return Math.max(MIN_FIT_SCALE, scale);
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
    const bend = Math.abs(to.x - from.x) / 2;
    const out = to.x >= from.x ? bend : -bend;
    return {
      from,
      to,
      path: `M ${from.x} ${from.y} C ${from.x + out} ${from.y}, ${to.x - out} ${to.y}, ${to.x} ${to.y}`,
    };
  };
  const down = (from: Point, to: Point): MapLine => {
    const bend = Math.abs(to.y - from.y) / 2;
    return {
      from,
      to,
      path: `M ${from.x} ${from.y} C ${from.x} ${from.y + bend}, ${to.x} ${to.y - bend}, ${to.x} ${to.y}`,
    };
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
