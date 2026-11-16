/** Over this many characters a file opens read-only: the limit core uses when it reads files (flow-files 4.5). */
export const LARGE_FILE_CHARACTERS = 1_000_000;

/** How much of a file is looked at for a zero byte, which a text file never has. */
const SNIFF_CHARACTERS = 8192;

/** What the editor can do with a file's text. */
export type TextKind = "text" | "large" | "not-text";

/** Whether a file's text can be edited, only read, or isn't text at all (a zero byte in its first 8 KB). */
export function textKindOf(text: string): TextKind {
  if (text.slice(0, SNIFF_CHARACTERS).includes("\u0000")) return "not-text";
  return text.length > LARGE_FILE_CHARACTERS ? "large" : "text";
}

/** A size a person reads: "512 bytes", "2.4 KB", "3.1 MB". */
export function sizeOf(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
