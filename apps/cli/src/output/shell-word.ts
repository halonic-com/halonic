import { printable } from "./printable.ts";

/**
 * The path as one word a shell reads back as it is: in double quotes when it
 * holds a space or a character a shell would read, so `cd "my agents"` can be
 * copied and run.
 *
 * @example
 * shellWord("acme"); // "acme"
 * shellWord("my agents"); // "\"my agents\""
 */
export function shellWord(path: string, platform: NodeJS.Platform = process.platform): string {
  const shown = printable(path);
  const isWindows = platform === "win32";

  const safePattern = isWindows ? /^[\w./:\\-]+$/u : /^[\w./:-]+$/u;

  if (safePattern.test(shown)) {
    return shown;
  }

  return isWindows ? `"${shown}"` : `"${shown.replace(/(["$`\\])/gu, "\\$1")}"`;
}
