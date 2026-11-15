import { type Box, CARD_SIZE, type Point } from "./geometry.ts";

/** One arrow between two steps, by id. */
export interface Link {
  readonly from: string;
  readonly to: string;
}

const COLUMN_GAP = 48;
const ROW_GAP = 64;

/**
 * Where each step goes when nobody has placed it: a row per distance from `initial` (the first
 * step on top, the steps it leads to below it), side by side inside a row, in the order the file
 * lists them. A step the first step can't reach goes in a row of its own at the bottom. Arrows
 * that point back up don't change a step's row (`workflows.canvas.auto-layout`).
 *
 * @example
 * autoLayout(["start", "done"], [{ from: "start", to: "done" }], "start");
 * // Map { "start" => { x: 0, y: 0 }, "done" => { x: 0, y: 136 } }
 */
export function autoLayout(
  ids: readonly string[],
  links: readonly Link[],
  initial: string,
): Map<string, Point> {
  const depth = new Map<string, number>();
  const queue = ids.includes(initial) ? [initial] : [];
  if (queue.length > 0) depth.set(initial, 0);
  for (const id of queue) {
    for (const link of links) {
      if (link.from === id && ids.includes(link.to) && !depth.has(link.to)) {
        depth.set(link.to, (depth.get(id) ?? 0) + 1);
        queue.push(link.to);
      }
    }
  }
  const lastRow = Math.max(-1, ...depth.values());
  const stray = ids.filter((id) => !depth.has(id));
  for (const id of stray) depth.set(id, lastRow + 1);

  const placed = new Map<string, Point>();
  const used = new Map<number, number>();
  for (const id of ids) {
    const row = depth.get(id) ?? 0;
    const column = used.get(row) ?? 0;
    used.set(row, column + 1);
    placed.set(id, {
      x: column * (CARD_SIZE.width + COLUMN_GAP),
      y: row * (CARD_SIZE.height + ROW_GAP),
    });
  }
  return placed;
}

/** The boxes of `ids`: a step the person placed (`saved`) stays there, the others take the auto layout. */
export function boxesFor(
  ids: readonly string[],
  links: readonly Link[],
  initial: string,
  saved: Readonly<Record<string, Point>>,
): Map<string, Box> {
  const automatic = autoLayout(ids, links, initial);
  return new Map(
    ids.map((id) => [id, { ...(saved[id] ?? automatic.get(id) ?? { x: 0, y: 0 }), ...CARD_SIZE }]),
  );
}
