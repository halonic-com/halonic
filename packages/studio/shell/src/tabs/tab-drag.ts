/** How far the pointer moves, in px, before a press on a tab becomes a drag, not a click. */
export const TAB_DRAG_THRESHOLD = 4;

/** Where a tab sits in the strip, from its bounding box. */
export interface TabSpan {
  readonly left: number;
  readonly width: number;
}

/**
 * Where a dragged tab goes: past every other tab whose middle is left of the pointer. The result
 * is the dragged tab's new index, as `TabSet.move` takes it. The dragged tab itself doesn't count,
 * so it stays put until the pointer crosses a neighbour's middle.
 *
 * @example
 * // Three 100px tabs, dragging the first to x = 160, past the second tab's middle (150):
 * dragTargetIndex(160, [{ left: 0, width: 100 }, { left: 100, width: 100 }, { left: 200, width: 100 }], 0); // 1
 */
export function dragTargetIndex(
  pointerX: number,
  spans: readonly TabSpan[],
  dragged: number,
): number {
  let index = 0;
  spans.forEach((span, at) => {
    if (at !== dragged && span.left + span.width / 2 < pointerX) {
      index += 1;
    }
  });
  return index;
}
