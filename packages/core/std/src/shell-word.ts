/** What a word may hold and stay unquoted. */
const safeWord = /^[\w./:-]+$/u;

/**
 * The text as one word a POSIX shell (`sh` and its kin) reads back as it is: in double quotes
 * when it holds a space or a character the shell would read, so a command such as
 * `cd "Acme sample"` can be copied and run. Inside the quotes `"`, `$`, `` ` `` and `\` are
 * escaped. The same rule as the CLI's own POSIX form.
 *
 * @example
 * shellWord("acme"); // "acme"
 * shellWord("/acme/Acme sample"); // "\"/acme/Acme sample\""
 */
export function shellWord(text: string): string {
  if (safeWord.test(text)) return text;
  return `"${text.replace(/(["$`\\])/gu, "\\$1")}"`;
}
