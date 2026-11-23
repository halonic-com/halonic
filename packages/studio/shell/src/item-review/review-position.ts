// Where Previous and Next land among an item's changes to review (AI changes 1.2, revision 5).
// Positions count from 0; the bar shows them from 1.

/**
 * The position Previous or Next goes to. Both wrap around, so neither ever waits: from the first
 * change Previous goes to the last, and from the last Next goes to the first.
 *
 * @example
 * steppedPosition(2, 3, "next"); // 0
 * steppedPosition(0, 3, "previous"); // 2
 */
export function steppedPosition(
  position: number,
  count: number,
  direction: "previous" | "next",
): number {
  if (count <= 0) return 0;
  const step = direction === "next" ? 1 : -1;
  return (((position + step) % count) + count) % count;
}

/**
 * The position once the list of changes has `count` left, such as after an Accept or a Reject:
 * it stays where it was, so Next goes on from there, unless that was past the new end, when it is
 * the last change.
 *
 * @example
 * positionWithin(1, 2); // 1: the change after the decided one is now at this place
 * positionWithin(2, 2); // 1: the last change was decided
 */
export function positionWithin(position: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(position, 0), count - 1);
}
