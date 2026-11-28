import type { StepContext, StepOutcome } from "../runner.ts";
import { filesTreeParts as parts } from "./files-tree-parts.ts";

/** A computed length such as "24px" as its number of CSS px. */
function px(value: string): number {
  return Number.parseFloat(value);
}

/**
 * Reads how the app drew the file tree's rows (`files.ui.tree-rows`) from their computed values: a
 * row at least 32px high with 8px corners, the rows 10px inside the column through the tree's own
 * padding, a row at the top starting 13px in and a row one level in 16px further. The step calls
 * it while a search holds the folders open, so a row one level in shows; without one it fails as
 * `NO_NESTED_ROW`. The kit's sizes are CSS px, so a scaled screen reads the same. Any other size
 * fails as `TREE_ROW_LOOK`, with every part that is off in its note.
 */
export async function rowsLook(context: StepContext): Promise<StepOutcome> {
  const { driver } = context;
  const top = parts.rowAtLevel(1);
  const nested = parts.rowAtLevel(2);
  // Reading a missing element throws, so the rows are counted first.
  if ((await driver.count(top)) === 0 || (await driver.count(nested)) === 0) {
    const note = "The search opened no folder, so the tree has no row one level in.";
    return { passed: false, code: "NO_NESTED_ROW", note };
  }
  const faults: string[] = [];
  const height = await driver.cssValue(top, "height");
  if (!(px(height) >= 32)) faults.push(`a row is ${height} high, not at least 32px`);
  const corner = await driver.cssValue(top, "border-top-left-radius");
  if (corner !== "8px") faults.push(`a row's corners are ${corner}, not 8px`);
  const edge = await driver.cssValue(parts.tree, "padding-left");
  if (edge !== "10px") faults.push(`the rows start ${edge} inside the column, not 10px`);
  const topStart = await driver.cssValue(top, "padding-left");
  if (topStart !== "13px") faults.push(`a row at the top starts ${topStart} in, not 13px`);
  const nestedStart = await driver.cssValue(nested, "padding-left");
  if (px(nestedStart) - px(topStart) !== 16) {
    faults.push(
      `a row one level in starts at ${nestedStart} and the top level at ${topStart}, not 16px apart`,
    );
  }
  if (faults.length === 0) return { passed: true };
  return { passed: false, code: "TREE_ROW_LOOK", note: `The file tree: ${faults.join("; ")}.` };
}
