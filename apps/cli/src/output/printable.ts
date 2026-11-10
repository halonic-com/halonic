/**
 * Control characters (C0, DEL and C1, which hold the escape that starts a
 * colour or a cursor move) and the bidi controls that can make a line read
 * in another order than it runs.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this finds
const unsafe = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

/**
 * Text Halonic didn't write, such as a sentence that quotes a value from a
 * workspace file, made safe for a terminal (cli-output section 5, "Outside
 * text is escaped"): each control character becomes its visible `\u` code,
 * so it can't colour the screen, move the cursor or turn the line around.
 * Other text, emoji and accents included, is left as it is.
 *
 * @example
 * printable('unknown hub "\u001b[31msupport"'); // 'unknown hub "\\u001b[31msupport"'
 */
export function printable(text: string): string {
  return text.replace(unsafe, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return `\\u${code.toString(16).padStart(4, "0")}`;
  });
}
