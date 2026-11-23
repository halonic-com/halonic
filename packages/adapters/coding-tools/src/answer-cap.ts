// The size limits of the tools' answers (HAL-16737, plan section 5). An
// answer goes into the model's context on every later turn, so each one is
// capped, and every cut says how to ask for the rest.

/** The most characters one answer holds, about 6,000 tokens. */
export const maxAnswerCharacters = 24_000;

/** The most characters of one line a tool shows; the rest is cut with a mark. */
export const maxLineCharacters = 500;

/**
 * The answer as it is when it fits {@link maxAnswerCharacters}, otherwise
 * cut at a line break before the limit, with a note that says how to narrow
 * the call. The note fits inside the limit too.
 *
 * @param narrowing - what the model can do instead, such as "give a smaller range"
 */
export function cappedAnswer(text: string, narrowing: string): string {
  if (text.length <= maxAnswerCharacters) return text;
  const note = `\n… [answer cut at ${maxAnswerCharacters} characters; ${narrowing}]`;
  const room = maxAnswerCharacters - note.length;
  const lineEnd = text.lastIndexOf("\n", room);
  return `${text.slice(0, lineEnd > 0 ? lineEnd : room)}${note}`;
}

/** The line, or its first `limit` characters with a mark when it is longer. */
export function cutLine(line: string, limit: number = maxLineCharacters): string {
  return line.length <= limit ? line : `${line.slice(0, limit)} … [line cut]`;
}

/** How a line range is written in answers: `12–40`, or `12` for one line. */
export function lineRange(start: number, end: number): string {
  return start === end ? String(start) : `${start}–${end}`;
}
