import type { Phrase } from "../messages/phrase.ts";

/**
 * The result lines a command printed before it ended, through
 * `CommandContext.printAhead` (requirement `cli.print-ahead`), so `runCli`
 * prints only the rest of the result at the end.
 */
export interface PrintedAhead {
  /** Notes a line as printed. */
  note(line: Phrase): void;
  /**
   * The result lines still to print: those after the ones printed ahead. When
   * the printed lines aren't the first lines of the result, word for word,
   * that is a bug in the command: every line is given again, since a line
   * printed twice beats a line lost, and the mismatch is recorded for
   * {@link takePrintAheadMismatches}.
   */
  rest(lines: readonly Phrase[]): readonly Phrase[];
}

/** A command whose lines printed ahead didn't start its result. */
export interface PrintAheadMismatch {
  readonly printed: readonly Phrase[];
  readonly result: readonly Phrase[];
}

// One CLI process runs one command line, so this stays small. The tests'
// setup file empties it after each test and fails the test if it wasn't empty.
const mismatches: PrintAheadMismatch[] = [];

/** A new, empty {@link PrintedAhead} for one command line. */
export function printedAhead(): PrintedAhead {
  const printed: Phrase[] = [];
  return {
    note: (line) => {
      printed.push(line);
    },
    rest(lines) {
      if (startsWith(lines, printed)) {
        return lines.slice(printed.length);
      }
      mismatches.push({ printed: [...printed], result: lines });
      return lines;
    },
  };
}

/**
 * The mismatches recorded since the last call, and forgets them. A
 * mismatch is always a bug in a command, so the CLI's tests fail on any.
 */
export function takePrintAheadMismatches(): PrintAheadMismatch[] {
  return mismatches.splice(0);
}

function startsWith(lines: readonly Phrase[], first: readonly Phrase[]): boolean {
  if (first.length > lines.length) {
    return false;
  }
  return first.every((line, index) => samePhrase(line, lines[index]));
}

/** Whether two phrases have the same parts: the same words, emphasis, marks and padding. */
function samePhrase(one: Phrase, other: Phrase | undefined): boolean {
  return JSON.stringify(one) === JSON.stringify(other);
}
