import { KindedError } from "@halonicjs/std";

/**
 * U+FFFD, the character the shell's `git` puts in place of bytes that aren't UTF-8 when it gives
 * git's output back as text. A text read from git that holds it may have lost bytes.
 */
const replacementCharacter = "�";

/**
 * Refuses a text read from git that may have lost bytes on the way: one that holds U+FFFD. Writing
 * it would change a file that isn't UTF-8 text, such as an image or a file in another encoding,
 * for everyone the version reaches. Such a file is left to git. A UTF-8 file that really holds
 * U+FFFD is refused as well; git can still write it.
 *
 * @throws KindedError `unavailable` naming the file when the text holds U+FFFD
 */
export function refuseLossyText(path: string, text: string): void {
  if (text.includes(replacementCharacter)) {
    throw new KindedError(
      "unavailable",
      `${path} isn't plain UTF-8 text, so Halonic can't write it without changing it. Use git for this file.`,
    );
  }
}
