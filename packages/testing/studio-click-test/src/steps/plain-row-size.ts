import type { StepContext, StepOutcome } from "../runner.ts";

/** Where a sidebar row and its picture's 48px place are, as XPaths. */
export interface SidebarRowParts {
  /** The row's box, which the kit draws exactly 72px high. */
  readonly row: string;
  /** The picture's place in that row, 48px high. */
  readonly picture: string;
}

/**
 * Reads the heights the app drew for a sidebar row and its picture (`kit.plain-row-size`): the
 * row exactly 72px and the picture 48px (the new design's row, HAL-20675). The kit's sizes are
 * CSS px, so a scaled screen still reads 72px here. Steps call it before they open the item, while the list shows: a window
 * below 900px wide then shows only the open item. A missing row fails as `NO_SIDEBAR_ROW`; a
 * missing picture is left to the step, which reports initials itself.
 */
export async function sidebarRowSize(
  context: StepContext,
  where: string,
  parts: SidebarRowParts,
): Promise<StepOutcome> {
  if ((await context.driver.count(parts.row)) === 0) {
    return { passed: false, code: "NO_SIDEBAR_ROW", note: `${where} isn't in the list.` };
  }
  const row = await context.driver.cssValue(parts.row, "height");
  // Reading a missing element throws, so a row showing initials reads no picture height.
  const pictureDrawn = (await context.driver.count(parts.picture)) > 0;
  const picture = pictureDrawn ? await context.driver.cssValue(parts.picture, "height") : "48px";
  if (row === "72px" && picture === "48px") return { passed: true };
  return {
    passed: false,
    code: "SIDEBAR_ROW_SIZE",
    note: `${where}: the row is ${row} high and its picture ${picture}, not 72px and 48px.`,
  };
}
