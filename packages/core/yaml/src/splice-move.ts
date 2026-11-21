import { isSeq, type Node, type YAMLSeq } from "yaml";
import {
  aboveCommentsAt,
  belowCommentsIndented,
  columnOf,
  entryEnd,
  lineStart,
  startsItsLine,
} from "./edit-text.ts";
import type { YamlPath } from "./read.ts";
import { dashOffset, nodeAt, type Parsed } from "./splice-node.ts";

// The `move` splice: list items change places as whole blocks of lines.

/**
 * Moves item `from` of the block list at `listPath` to index `to`. Each item
 * moves as one block of whole lines: the comment lines right above its `-` at
 * the same indent, its own lines, the comment at the end of its last line and
 * the comment lines right below it that are indented further than its `-`.
 * The text between the blocks, such as a blank line or a comment indented
 * otherwise, stays where it is, and the items change places around it.
 */
export function moveItem(
  parsed: Parsed,
  listPath: YamlPath,
  from: number,
  to: number,
): string | undefined {
  const list = nodeAt(parsed, listPath);
  if (!isSeq(list) || list.flow === true) {
    return undefined;
  }
  // Without a line break at the end, the last item's block would run into the one after it.
  const addsBreak = !parsed.text.endsWith("\n");
  const text = addsBreak ? `${parsed.text}\n` : parsed.text;
  const blocks = itemBlocks(text, list);
  if (blocks === undefined) {
    return undefined;
  }
  const order = blocks.map((_, index) => index);
  order.splice(to, 0, ...order.splice(from, 1));
  const parts = [text.slice(0, blocks[0]?.start)];
  order.forEach((item, slot) => {
    const block = blocks[item] as LineBlock;
    const gapEnd = blocks[slot + 1]?.start ?? text.length;
    parts.push(text.slice(block.start, block.end), text.slice(blocks[slot]?.end, gapEnd));
  });
  const moved = parts.join("");
  return addsBreak ? moved.slice(0, -1) : moved;
}

/** Whole lines of a text, from the line start `start` to the line start `end`. */
interface LineBlock {
  readonly start: number;
  readonly end: number;
}

/**
 * Each item of a block list as the block of lines `moveItem` moves, in order.
 * `undefined` when an item shares its first line with something before it,
 * as the first item of `- - a` does, or has no text.
 */
function itemBlocks(text: string, list: YAMLSeq): LineBlock[] | undefined {
  const blocks: LineBlock[] = [];
  for (const [index, item] of list.items.entries()) {
    const dash = dashOffset(list, index);
    const valueEnd = (item as Node | null)?.range?.[1];
    if (dash === undefined || valueEnd === undefined || !startsItsLine(text, dash)) {
      return undefined;
    }
    const column = columnOf(text, dash);
    const start = aboveCommentsAt(text, lineStart(text, dash), column);
    const previousEnd = blocks.at(-1)?.end ?? 0;
    const end = belowCommentsIndented(text, entryEnd(text, valueEnd), column);
    blocks.push({ start: Math.max(start, previousEnd), end });
  }
  return blocks;
}
