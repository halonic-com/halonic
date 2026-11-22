import { printable } from "./printable.ts";

/**
 * What PowerShell reads inside double quotes, and how each is written so it
 * stays a plain character: `$` would start a variable or `$(…)`, a backtick an
 * escape, and PowerShell ends the string at `"` and at the curly quotes too.
 * A `"` is doubled instead of escaped with a backtick, because cmd.exe counts
 * quotes: a doubled one keeps the rest of the word inside the quotes there.
 */
const powerShellEscapes: Readonly<Record<string, string>> = {
  $: "`$",
  "`": "``",
  '"': '""',
  "“": "`“",
  "”": "`”",
  "„": "`„",
};

/**
 * The path as one word a shell reads back as it is: in double quotes when it
 * holds a space or a character a shell would read, so `cd "my agents"` can be
 * copied and run.
 *
 * On Windows the quotes stay double, because both PowerShell and cmd.exe read
 * them, and what PowerShell would expand is escaped (see `powerShellEscapes`).
 * cmd.exe keeps those escapes as they are, so a path with `$` or a backtick
 * names the wrong folder there, but nothing in it runs: every operator stays
 * inside the quotes.
 *
 * @example
 * shellWord("acme"); // "acme"
 * shellWord("my agents"); // "\"my agents\""
 * shellWord("my $(agents)", "win32"); // "\"my `$(agents)\""
 */
export function shellWord(path: string, platform: NodeJS.Platform = process.platform): string {
  const shown = printable(path);
  const isWindows = platform === "win32";

  const safePattern = isWindows ? /^[\w./:\\-]+$/u : /^[\w./:-]+$/u;

  if (safePattern.test(shown)) {
    return shown;
  }

  return isWindows ? `"${powerShellQuoted(shown)}"` : `"${shown.replace(/(["$`\\])/gu, "\\$1")}"`;
}

/** The text with every character PowerShell expands inside double quotes escaped. */
function powerShellQuoted(text: string): string {
  return text.replace(/[$`"“”„]/gu, (character) => powerShellEscapes[character] ?? character);
}
