import type { SavedDocsLogEntry } from "@halonicjs/ports";

/**
 * The site card's words and the docs log's line under a `read_docs` call
 * (`assistant.build.site-card`). New strings, free until their copy check (HAL-18451).
 */
export const siteCardWords = {
  /** The card's question and the `article`'s name: the exact host, as the tool asked for it. */
  question: (host: string) => `Read docs from ${host}?`,
  /** What Allow means, under the question. */
  line: "If you allow it, the assistant can read pages from this site for the rest of this chat.",
  allow: "Allow",
  dontAllow: "Don't allow",
  /** The card once answered: its buttons go, the answer stays. */
  allowed: "Allowed for this chat.",
  declined: "Not allowed in this chat.",
  cantAnswer: (reason: string) => `Couldn't save your answer: ${reason}`,
} as const;

/** The docs log's one line for a `read_docs` call: what was asked for and how it ended. */
export function docsLogLine(entry: SavedDocsLogEntry): string {
  const status = entry.status === undefined ? "" : ` (${entry.status})`;
  switch (entry.outcome) {
    case "read":
      return `Read ${entry.url}${status}, ${sizeOf(entry.bytes)}`;
    case "moved":
      return `Not read: ${entry.url} moved${status}, not followed`;
    case "not-read":
      return `Not read: ${entry.url}${status}`;
    case "waiting":
      return `Waiting for your answer: ${entry.url}`;
    case "declined":
      return `Not read: you didn't allow this site, ${entry.url}`;
    case "refused":
      return `Refused: ${entry.url}`;
  }
}

/** Bytes as the log line says them: "512 bytes", "12 KB". */
function sizeOf(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes / 1024)} KB`;
}
