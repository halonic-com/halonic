/**
 * A unified diff of one file, in git's format, with the whole file in one
 * hunk. `null` means the file isn't there on that side. Gives `""` when both
 * sides are the same. Good enough for tests and the demo; the git adapter
 * gets its diffs from git.
 *
 * Generic enough for `@halonicjs/std`; it moves there once that package has
 * its text helpers.
 */
export function unifiedDiff(path: string, before: string | null, after: string | null): string {
  if (before === after) return "";
  const oldLines = splitLines(before ?? "");
  const newLines = splitLines(after ?? "");
  const header = [
    `diff --git a/${path} b/${path}`,
    before === null ? "--- /dev/null" : `--- a/${path}`,
    after === null ? "+++ /dev/null" : `+++ b/${path}`,
    `@@ -${range(oldLines.length)} +${range(newLines.length)} @@`,
  ];
  const body = diffLines(oldLines, newLines).flatMap((line) =>
    line.endsWith("\n") ? [line.slice(0, -1)] : [line, "\\ No newline at end of file"],
  );
  return `${[...header, ...body].join("\n")}\n`;
}

/**
 * The lines of `text`, each with its newline, so a last line without one
 * differs from the same line with one, as it does for git.
 */
function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
}

/** A hunk's range of the whole file; like git, a range of one line has no count. */
function range(count: number): string {
  if (count === 1) return "1";
  return count === 0 ? "0,0" : `1,${count}`;
}

/**
 * Every line of both sides, with its newline when it has one, marked " "
 * (kept), "-" (removed) or "+" (added),
 * from a longest common subsequence. Quadratic, which is fine for workspace
 * files.
 */
function diffLines(oldLines: string[], newLines: string[]): string[] {
  // common(i, j): length of the longest common subsequence of oldLines[i..] and newLines[j..].
  const width = newLines.length + 1;
  const table = new Array<number>((oldLines.length + 1) * width).fill(0);
  // Every cell read is inside the table, which starts filled with 0.
  const common = (i: number, j: number) => table[i * width + j] as number;
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      table[i * width + j] =
        oldLines[i] === newLines[j]
          ? common(i + 1, j + 1) + 1
          : Math.max(common(i + 1, j), common(i, j + 1));
    }
  }

  // Walk the table; like git, a removed line comes before the line that replaces it.
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      out.push(` ${oldLines[i]}`);
      i++;
      j++;
    } else if (
      i < oldLines.length &&
      (j === newLines.length || common(i + 1, j) >= common(i, j + 1))
    ) {
      out.push(`-${oldLines[i]}`);
      i++;
    } else {
      out.push(`+${newLines[j]}`);
      j++;
    }
  }
  return out;
}
