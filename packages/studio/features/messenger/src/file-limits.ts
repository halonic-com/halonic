/**
 * Which files the Messenger puts on a message (requirement `messenger.files`):
 * at most 5, of at most 10 MiB each, and only pictures, PDFs and text. It
 * checks a file when it is added, before reading it, so the person hears at
 * once. The engine checks again on `send`, whatever the Messenger did, and
 * refuses the whole message (ADR, Attachments). No SVG or HTML: either can
 * hold script.
 */
export const messengerFileLimits = {
  maxBytes: 10 * 1024 * 1024,
  maxFiles: 5,
  types: [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
  ],
} as const;

/** Why a file can't go on a message. */
export type FileRefusal = "too-large" | "too-many" | "unsupported-type";

/** Why `files` can't all go on one message, or `undefined` when they can. */
export function fileRefusal(
  files: readonly { type: string; size: number }[],
): FileRefusal | undefined {
  if (files.length > messengerFileLimits.maxFiles) return "too-many";
  const types: readonly string[] = messengerFileLimits.types;
  if (files.some((file) => !types.includes(file.type))) return "unsupported-type";
  if (files.some((file) => file.size > messengerFileLimits.maxBytes)) return "too-large";
  return undefined;
}
