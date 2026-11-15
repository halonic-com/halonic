/**
 * What `git diff HEAD` says about one file, read back as the file's text in the last version. The
 * Studio's git allow-list has no `show`, so the last version is rebuilt from a diff with every line
 * of context: the lines that are context or removed are the file as it was.
 */

/** The arguments that make git print the whole file as one hunk. */
export function lastVersionDiffArgs(path: string): readonly string[] {
  return ["diff", "HEAD", "--no-color", "--unified=999999", "--", path];
}

/** One line of the old file, and whether a line break follows it. */
interface OldLine {
  text: string;
  endsWithBreak: boolean;
}

/**
 * The file as it was in the last version, from the output of {@link lastVersionDiffArgs}.
 *
 * @param diff - what git printed; empty when the file didn't change
 * @param current - the file as it is now, used when git printed no difference
 * @returns the old text, or `null` when the file wasn't in the last version
 * @throws when the diff is of a binary file, which has no lines to read
 *
 * @example
 * lastVersionFromDiff("--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n one\n-two\n+three\n", "one\nthree\n");
 * // "one\ntwo\n"
 */
export function lastVersionFromDiff(diff: string, current: string | null): string | null {
  if (diff === "") return current;
  const lines = diff.split("\n");
  if (lines.some((line) => line.startsWith("Binary files ") || line === "GIT binary patch")) {
    throw new Error("This file isn't text, so its changes can't be shown.");
  }
  const start = lines.findIndex((line) => line.startsWith("@@"));
  // Only the header can say the file is new; a removed line "-- /dev/null" sits after it.
  const header = start === -1 ? lines : lines.slice(0, start);
  if (header.includes("--- /dev/null")) return null;
  if (start === -1) return current;
  return oldLines(lines.slice(start + 1))
    .map((line) => line.text + (line.endsWithBreak ? "\n" : ""))
    .join("");
}

/** The old file's lines from the diff's one hunk: context and removed lines. */
function oldLines(hunk: readonly string[]): OldLine[] {
  const old: OldLine[] = [];
  // Whether the line a "\ No newline at end of file" marker follows was in the old file.
  let previousWasOld = false;
  for (const line of hunk) {
    const marker = line[0];
    if (marker === " " || marker === "-") {
      old.push({ text: line.slice(1), endsWithBreak: true });
      previousWasOld = true;
    } else if (marker === "+") {
      previousWasOld = false;
    } else if (marker === "\\" && previousWasOld) {
      const last = old.at(-1);
      if (last !== undefined) last.endsWithBreak = false;
    }
  }
  return old;
}
