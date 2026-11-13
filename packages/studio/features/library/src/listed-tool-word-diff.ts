/** One stretch of text in a changed line: kept, taken out of the old version, or put into the new one. */
export interface WordPiece {
  readonly kind: "same" | "removed" | "added";
  readonly text: string;
}

/** Words and the spaces between them, so the pieces join back into the exact text. */
function tokens(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Joins neighbours of the same kind into one piece. */
function merged(pieces: readonly WordPiece[]): WordPiece[] {
  const result: WordPiece[] = [];
  for (const piece of pieces) {
    const last = result[result.length - 1];
    if (last !== undefined && last.kind === piece.kind) {
      result[result.length - 1] = { kind: last.kind, text: last.text + piece.text };
    } else {
      result.push(piece);
    }
  }
  return result;
}

/** How many words the longest run in common has, for each pair of prefixes: the usual table. */
function commonLengths(before: readonly string[], after: readonly string[]): number[][] {
  const table: number[][] = [new Array<number>(after.length + 1).fill(0)];
  for (let row = 1; row <= before.length; row++) {
    const above = table[row - 1] ?? [];
    const current = [0];
    for (let column = 1; column <= after.length; column++) {
      current.push(
        before[row - 1] === after[column - 1]
          ? (above[column - 1] ?? 0) + 1
          : Math.max(above[column] ?? 0, current[column - 1] ?? 0),
      );
    }
    table.push(current);
  }
  return table;
}

/**
 * The words that left, stayed and arrived between two texts. `removed` pieces belong to the
 * old version's column and `added` pieces to the new one's; `same` pieces show in both.
 */
export function wordDiff(before: string, after: string): WordPiece[] {
  const old = tokens(before);
  const now = tokens(after);
  const table = commonLengths(old, now);
  const pieces: WordPiece[] = [];
  let row = old.length;
  let column = now.length;
  while (row > 0 || column > 0) {
    if (row > 0 && column > 0 && old[row - 1] === now[column - 1]) {
      pieces.push({ kind: "same", text: old[row - 1] ?? "" });
      row--;
      column--;
    } else if (
      column > 0 &&
      (row === 0 || (table[row]?.[column - 1] ?? 0) >= (table[row - 1]?.[column] ?? 0))
    ) {
      pieces.push({ kind: "added", text: now[column - 1] ?? "" });
      column--;
    } else {
      pieces.push({ kind: "removed", text: old[row - 1] ?? "" });
      row--;
    }
  }
  return merged(pieces.reverse());
}
