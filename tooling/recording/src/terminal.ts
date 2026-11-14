import type { Cast } from "./asciicast.ts";
import type {
  CommandMarker,
  CursorPosition,
  LineVersion,
  ScrollPosition,
  Span,
  Tape,
  TextStyle,
} from "./tape.ts";

const plain: TextStyle = { colour: "default", bold: false, dim: false };
// biome-ignore lint/suspicious/noControlCharactersInRegex: escape codes are what this reads
const controlSequence = /\x1b\[([0-9;]*)([A-Za-z])/y;
// biome-ignore lint/suspicious/noControlCharactersInRegex: escape codes are what this reads
const anyEscapePrefix = /^\x1b(\[[0-9;?]*)?$/;

interface Cell {
  readonly character: string;
  readonly style: TextStyle;
}

/**
 * Plays a cast through a small terminal that knows only what our CLI
 * prints: text, CR/LF, backspace, tab, colours (SGR), erase in line and
 * cursor moves. Anything else stops with an error naming it, so a new
 * escape code in the CLI can't be drawn wrong without anyone noticing.
 */
export function playCast(cast: Cast): Tape {
  const terminal = new Terminal(cast.header.width, cast.header.height);
  const commands: CommandMarker[] = [];
  let lastOutput = 0;
  for (const event of cast.events) {
    if (event.kind === "m") commands.push({ time: event.time, command: event.data });
    if (event.kind !== "o") continue;
    terminal.write(event.data);
    terminal.snapshot(event.time);
    lastOutput = event.time;
  }
  terminal.finish();
  return {
    columns: cast.header.width,
    rows: cast.header.height,
    duration: cast.header.duration ?? lastOutput,
    lastOutput,
    lines: terminal.history,
    cursor: terminal.cursorHistory,
    scroll: terminal.scrollHistory,
    commands,
  };
}

class Terminal {
  readonly history: LineVersion[][] = [[]];
  readonly cursorHistory: CursorPosition[] = [{ time: 0, line: 0, column: 0 }];
  readonly scrollHistory: ScrollPosition[] = [{ time: 0, top: 0 }];
  private readonly cells: Cell[][] = [[]];
  private readonly changedLines = new Set<number>();
  private line = 0;
  private column = 0;
  private top = 0;
  private style: TextStyle = plain;
  private unfinished = "";
  private readonly columns: number;
  private readonly rows: number;

  constructor(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
  }

  write(text: string): void {
    const input = this.unfinished + text;
    this.unfinished = "";
    let index = 0;
    while (index < input.length) {
      const character = String.fromCodePoint(input.codePointAt(index) ?? 0);
      if (character === "\x1b") {
        const consumed = this.escape(input, index);
        if (consumed === 0) {
          this.unfinished = input.slice(index);
          return;
        }
        index += consumed;
        continue;
      }
      this.character(character);
      index += character.length;
    }
  }

  /** Records what changed since the last snapshot, as of `time`. */
  snapshot(time: number): void {
    for (const line of this.changedLines) {
      const versions = this.history[line] ?? [];
      this.history[line] = versions;
      replaceOrPush(versions, { time, spans: spansOf(this.cells[line] ?? []) }, sameSpans);
    }
    this.changedLines.clear();
    replaceOrPush(this.cursorHistory, { time, line: this.line, column: this.column }, sameCursor);
    replaceOrPush(this.scrollHistory, { time, top: this.top }, (a, b) => a.top === b.top);
  }

  finish(): void {
    if (this.unfinished !== "")
      throw new Error(
        `The session ends inside an escape code: ${JSON.stringify(this.unfinished)}.`,
      );
  }

  /** Handles the escape code at `index`; returns its length, or 0 if it continues in the next event. */
  private escape(input: string, index: number): number {
    controlSequence.lastIndex = index;
    const match = controlSequence.exec(input);
    if (match === null) {
      if (anyEscapePrefix.test(input.slice(index))) return 0;
      throw new Error(`Unsupported escape code ${JSON.stringify(input.slice(index, index + 8))}.`);
    }
    const [sequence, parameterText = "", command = ""] = match;
    const parameters = parameterText === "" ? [] : parameterText.split(";").map(Number);
    this.controlSequence(command, parameters);
    return sequence.length;
  }

  private controlSequence(command: string, parameters: number[]): void {
    const count = Math.max(1, parameters[0] ?? 1);
    switch (command) {
      case "m":
        this.style = applySgr(this.style, parameters.length === 0 ? [0] : parameters);
        return;
      case "K":
        this.eraseInLine(parameters[0] ?? 0);
        return;
      case "G":
        this.column = Math.min(this.columns - 1, count - 1);
        return;
      case "C":
        this.column = Math.min(this.columns - 1, this.column + count);
        return;
      case "D":
        this.column = Math.max(0, this.column - count);
        return;
      case "A":
        this.line = Math.max(this.top, this.line - count);
        return;
      default:
        throw new Error(`Unsupported control sequence "ESC[${parameters.join(";")}${command}".`);
    }
  }

  private character(character: string): void {
    if (character === "\r") this.column = 0;
    else if (character === "\n") this.lineFeed();
    else if (character === "\b") this.column = Math.max(0, this.column - 1);
    else if (character === "\t")
      this.column = Math.min(this.columns - 1, (Math.floor(this.column / 8) + 1) * 8);
    else if (character === "\x07") return;
    else if (character < " " || character === "\x7f") {
      throw new Error(
        `Unsupported control character U+${character.codePointAt(0)?.toString(16).padStart(4, "0")}.`,
      );
    } else this.print(character);
  }

  private print(character: string): void {
    if (isWide(character))
      throw new Error(`"${character}" takes two columns, which this terminal doesn't draw.`);
    // A real terminal would wrap here, but in a recording a wrapped line is
    // a line that no longer fits the window, so the take has to change.
    if (this.column >= this.columns)
      throw new Error(
        `Line ${this.line + 1} is wider than the ${this.columns} columns: "${this.textOf(this.line)}${character}…".`,
      );
    const row = this.cells[this.line] ?? [];
    this.cells[this.line] = row;
    row[this.column] = { character, style: this.style };
    this.changedLines.add(this.line);
    this.column += 1;
  }

  private textOf(line: number): string {
    return Array.from(this.cells[line] ?? [], (cell) => cell?.character ?? " ").join("");
  }

  private lineFeed(): void {
    this.line += 1;
    if (this.cells[this.line] === undefined) this.cells[this.line] = [];
    if (this.history[this.line] === undefined) this.history[this.line] = [];
    this.top = Math.max(this.top, this.line - this.rows + 1);
  }

  private eraseInLine(mode: number): void {
    const row = this.cells[this.line] ?? [];
    if (mode === 0) row.length = Math.min(row.length, this.column);
    else if (mode === 1)
      for (let column = 0; column <= this.column; column += 1) delete row[column];
    else if (mode === 2) row.length = 0;
    else throw new Error(`Unsupported erase-in-line mode ${mode}.`);
    this.cells[this.line] = row;
    this.changedLines.add(this.line);
  }
}

/** Applies SGR parameters: reset, bold, dim, normal intensity and the 16 foreground colours. */
function applySgr(style: TextStyle, parameters: readonly number[]): TextStyle {
  return parameters.reduce(applyOneSgr, style);
}

function applyOneSgr(style: TextStyle, parameter: number): TextStyle {
  if (parameter === 0) return plain;
  if (parameter === 1) return { ...style, bold: true };
  if (parameter === 2) return { ...style, dim: true };
  if (parameter === 22) return { ...style, bold: false, dim: false };
  if (parameter === 39) return { ...style, colour: "default" };
  if (parameter >= 30 && parameter <= 37) return { ...style, colour: parameter - 30 };
  if (parameter >= 90 && parameter <= 97) return { ...style, colour: parameter - 90 + 8 };
  throw new Error(`Unsupported text style SGR ${parameter}.`);
}

/**
 * Groups a line's cells into spans. A space takes the style of the span
 * it sits in, and spaces at the end of a span are dropped, so a line with
 * columns of text becomes few spans.
 */
function spansOf(row: readonly (Cell | undefined)[]): Span[] {
  const spans: Span[] = [];
  let current: { column: number; text: string; style: TextStyle } | undefined;
  for (let column = 0; column < row.length; column += 1) {
    const cell = row[column];
    const character = cell?.character ?? " ";
    if (
      current !== undefined &&
      (character === " " || sameStyle(current.style, cell?.style ?? plain))
    ) {
      current.text += character;
      continue;
    }
    if (character === " ") continue;
    if (current !== undefined) spans.push({ ...current, text: current.text.trimEnd() });
    current = { column, text: character, style: cell?.style ?? plain };
  }
  if (current !== undefined) spans.push({ ...current, text: current.text.trimEnd() });
  return spans;
}

function sameStyle(a: TextStyle, b: TextStyle): boolean {
  return a.colour === b.colour && a.bold === b.bold && a.dim === b.dim;
}

function sameSpans(a: LineVersion, b: LineVersion): boolean {
  return JSON.stringify(a.spans) === JSON.stringify(b.spans);
}

function sameCursor(a: CursorPosition, b: CursorPosition): boolean {
  return a.line === b.line && a.column === b.column;
}

/** Adds `entry` unless it equals the last one; an entry at the same time as the last replaces it. */
function replaceOrPush<Entry extends { readonly time: number }>(
  list: Entry[],
  entry: Entry,
  same: (a: Entry, b: Entry) => boolean,
): void {
  const last = list.at(-1);
  if (last !== undefined && same(last, entry)) return;
  if (last !== undefined && last.time === entry.time) list.pop();
  const before = list.at(-1);
  if (before !== undefined && same(before, entry)) return;
  list.push(entry);
}

/** Characters most terminals draw two columns wide: CJK, Hangul, full-width forms and emoji. */
function isWide(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    code >= 0x20000
  );
}
