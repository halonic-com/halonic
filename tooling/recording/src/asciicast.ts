/**
 * The asciicast v2 format: one JSON header line, then one JSON array per
 * event. We use it because any terminal player and GIF maker reads it, so
 * the capture doesn't tie us to the SVG.
 * Spec: https://docs.asciinema.org/manual/asciicast/v2/
 */

/** `o` is output, `i` is typed input, `m` is a marker (a chapter: we mark each command). */
export type CastEventKind = "o" | "i" | "m";

/** One event, `time` seconds after the start. */
export interface CastEvent {
  readonly time: number;
  readonly kind: CastEventKind;
  readonly data: string;
}

/** The header line. `duration` includes the rest at the end, which has no event of its own. */
export interface CastHeader {
  readonly version: 2;
  readonly width: number;
  readonly height: number;
  readonly timestamp?: number;
  readonly duration?: number;
  readonly title?: string;
  readonly env?: Readonly<Record<string, string>>;
}

/** A whole recording. */
export interface Cast {
  readonly header: CastHeader;
  readonly events: readonly CastEvent[];
}

/** Writes a cast as asciicast v2 text, with times to the microsecond. */
export function formatCast(cast: Cast): string {
  const lines = [JSON.stringify(cast.header)];
  for (const event of cast.events) {
    lines.push(JSON.stringify([roundSeconds(event.time), event.kind, event.data]));
  }
  return `${lines.join("\n")}\n`;
}

/** Reads asciicast v2 text. Throws on anything that isn't version 2 or an event it can't read. */
export function parseCast(text: string): Cast {
  const [headerLine, ...eventLines] = text.split("\n").filter((line) => line.trim() !== "");
  if (headerLine === undefined) throw new Error("The cast is empty.");
  const header: unknown = JSON.parse(headerLine);
  if (!isCastHeader(header)) throw new Error("The cast's first line isn't an asciicast v2 header.");
  const events = eventLines.map((line, index) => parseEvent(line, index + 2));
  return { header, events };
}

function parseEvent(line: string, lineNumber: number): CastEvent {
  const value: unknown = JSON.parse(line);
  if (!Array.isArray(value) || value.length !== 3)
    throw new Error(`Line ${lineNumber} isn't a cast event.`);
  const [time, kind, data] = value as unknown[];
  if (typeof time !== "number" || typeof data !== "string" || !isEventKind(kind)) {
    throw new Error(`Line ${lineNumber} isn't a cast event we read (time, "o" | "i" | "m", text).`);
  }
  return { time, kind, data };
}

function isEventKind(value: unknown): value is CastEventKind {
  return value === "o" || value === "i" || value === "m";
}

function isCastHeader(value: unknown): value is CastHeader {
  if (typeof value !== "object" || value === null) return false;
  const header = value as Record<string, unknown>;
  return (
    header["version"] === 2 &&
    typeof header["width"] === "number" &&
    typeof header["height"] === "number"
  );
}

/** Rounds to the microsecond, the precision asciicast players use. */
export function roundSeconds(seconds: number): number {
  return Math.round(seconds * 1_000_000) / 1_000_000;
}
