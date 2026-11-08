import { CST, Lexer } from "yaml";

/** A block list or map that is still open, and the column its entries start at. */
interface BlockLevel {
  readonly kind: "list" | "map";
  readonly col: number;
}

/** Token types that carry no structure: they never open or close a level. */
const quietTypes: ReadonlySet<string | null> = new Set([
  "space",
  "newline",
  "comment",
  "byte-order-mark",
]);

/**
 * Finds where lists and maps first nest deeper than `maxDepth`, by reading
 * the text as tokens, without building any tree. The `yaml` library builds
 * the whole tree before we can look at it, so a hostile file such as five
 * million `[` would use up memory first. This pass needs memory for the
 * open levels only, and stops at the first one past the limit.
 *
 * Block levels are counted from indentation. The count can be a little
 * higher than the real depth in odd layouts; `findUnsupported` still checks
 * the exact tree afterwards.
 *
 * @returns the offset of the first list or map past the limit, or `undefined`
 */
export function findDepthOffset(text: string, maxDepth: number): number | undefined {
  const scan = new DepthScan();
  let offset = 0;
  for (const token of new Lexer().lex(text)) {
    // The lexer marks documents, scalars and errors with control characters
    // that are not in the text, so they take no space.
    const inText = !isMarker(token);
    const type = inText ? CST.tokenType(token) : null;
    const lineStart = scan.lineStart;
    if (inText) {
      scan.noteText(token, offset);
    }
    const reached =
      inText && !quietTypes.has(type) ? scan.take(type, offset, offset - lineStart) : 0;
    if (reached > maxDepth) {
      return scan.reportAt;
    }
    offset += inText ? token.length : 0;
  }
  return undefined;
}

/** True for the control-character tokens the lexer adds that are not in the text. */
function isMarker(token: string): boolean {
  return token === CST.DOCUMENT || token === CST.FLOW_END || token === CST.SCALAR;
}

/** The open lists and maps while the tokens of a text go by. */
class DepthScan {
  /** Offset of the start of the current line. */
  lineStart = 0;
  /** Where to report the level that was just opened. */
  reportAt = 0;

  private readonly blocks: BlockLevel[] = [];
  private flowDepth = 0;
  private atLineStart = true;
  /** Where the key of the current entry starts, so a `:` knows its map's column. */
  private entry: { readonly col: number; readonly offset: number } | undefined;

  /** Keeps track of line breaks, including those inside multi-line scalars. */
  noteText(token: string, offset: number): void {
    const lastBreak = token.lastIndexOf("\n");
    if (lastBreak !== -1) {
      this.lineStart = offset + lastBreak + 1;
      this.atLineStart = true;
      this.entry = undefined;
    }
  }

  /**
   * Takes one token that has structure.
   *
   * @returns how many lists and maps are open now
   */
  take(type: string | null, offset: number, col: number): number {
    this.reportAt = offset;
    if (type === "doc-start" || type === "doc-end") {
      this.blocks.length = 0;
      this.flowDepth = 0;
    } else if (this.flowDepth > 0 || type === "flow-map-start" || type === "flow-seq-start") {
      this.takeFlow(type, offset, col);
    } else {
      this.takeBlock(type, offset, col);
    }
    return this.blocks.length + this.flowDepth;
  }

  private takeFlow(type: string | null, offset: number, col: number): void {
    this.claimEntry(col, offset);
    if (type === "flow-map-start" || type === "flow-seq-start") {
      if (this.flowDepth === 0 && this.atLineStart) {
        this.closeBlocksDeeperThan(col);
      }
      this.flowDepth++;
    } else if (type === "flow-map-end" || type === "flow-seq-end") {
      this.flowDepth--;
    }
    this.atLineStart = false;
  }

  private takeBlock(type: string | null, offset: number, col: number): void {
    if (this.atLineStart) {
      this.closeBlocksDeeperThan(col);
      this.atLineStart = false;
    }
    if (type === "seq-item-ind" || type === "explicit-key-ind") {
      this.enter(type === "seq-item-ind" ? "list" : "map", col);
      this.entry = undefined;
    } else if (type === "map-value-ind") {
      // A map is reported where its first key starts, not at the colon.
      this.reportAt = this.entry?.offset ?? offset;
      this.enter("map", this.entry?.col ?? col);
      this.entry = undefined;
    } else {
      this.claimEntry(col, offset);
    }
  }

  private claimEntry(col: number, offset: number): void {
    this.entry ??= { col, offset };
  }

  /** Opens a block level at `col`, or reuses it, closing every level inside it. */
  private enter(kind: BlockLevel["kind"], col: number): void {
    this.closeBlocksDeeperThan(col);
    for (let index = this.blocks.length - 1; index >= 0; index--) {
      const level = this.blocks[index] as BlockLevel;
      if (level.col !== col) {
        break;
      }
      if (level.kind === kind) {
        this.blocks.length = index + 1;
        return;
      }
    }
    this.blocks.push({ kind, col });
  }

  private closeBlocksDeeperThan(col: number): void {
    while ((this.blocks.at(-1)?.col ?? -1) > col) {
      this.blocks.pop();
    }
  }
}
