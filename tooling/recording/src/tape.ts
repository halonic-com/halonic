/** A terminal colour: the default text colour, or one of the 16 ANSI colours (0–7 normal, 8–15 bright). */
export type Colour = "default" | number;

/** How a run of text looks. */
export interface TextStyle {
  readonly colour: Colour;
  readonly bold: boolean;
  readonly dim: boolean;
}

/** A run of same-looking text starting at a column. */
export interface Span {
  readonly column: number;
  readonly text: string;
  readonly style: TextStyle;
}

/** What one line shows from `time` on, until its next version. */
export interface LineVersion {
  readonly time: number;
  readonly spans: readonly Span[];
}

/** Where the cursor is from `time` on. `line` counts from the first line of the session. */
export interface CursorPosition {
  readonly time: number;
  readonly line: number;
  readonly column: number;
}

/** The first line on screen from `time` on. */
export interface ScrollPosition {
  readonly time: number;
  readonly top: number;
}

/** A command being typed, from the cast's markers. */
export interface CommandMarker {
  readonly time: number;
  readonly command: string;
}

/**
 * A whole session as the screen showed it: every line of the session with
 * its versions over time, the cursor, and the scrolling. The SVG is drawn
 * from this.
 */
export interface Tape {
  readonly columns: number;
  readonly rows: number;
  /** Seconds until the recording rests. */
  readonly duration: number;
  /** When the last output appeared. */
  readonly lastOutput: number;
  readonly lines: readonly (readonly LineVersion[])[];
  readonly cursor: readonly CursorPosition[];
  readonly scroll: readonly ScrollPosition[];
  readonly commands: readonly CommandMarker[];
}
