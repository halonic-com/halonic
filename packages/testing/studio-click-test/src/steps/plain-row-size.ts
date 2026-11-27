import type { StepContext, StepOutcome } from "../runner.ts";

/** Where a sidebar row and its picture's 60px place are, as XPaths. */
export interface SidebarRowParts {
  /** The row's box, which the kit draws exactly 80px high. */
  readonly row: string;
  /** The picture's place in that row, 60px high. */
  readonly picture: string;
}

/**
 * Reads the heights the app drew for a sidebar row and its picture (`kit.plain-row-size`): the
 * row exactly 80px and the picture 60px. The kit's sizes are CSS px, so a scaled screen still
 * reads 80px here. A narrow window shows only the open item, with no list, so there is nothing
 * to measure.
 */
export async function sidebarRowSize(
  context: StepContext,
  where: string,
  parts: SidebarRowParts,
): Promise<StepOutcome> {
  if ((await context.driver.count(parts.row)) === 0) return { passed: true };
  const row = await context.driver.cssValue(parts.row, "height");
  const picture = await context.driver.cssValue(parts.picture, "height");
  if (row === "80px" && picture === "60px") return { passed: true };
  return {
    passed: false,
    code: "SIDEBAR_ROW_SIZE",
    note: `${where}: the row is ${row} high and its picture ${picture}, not 80px and 60px.`,
  };
}
