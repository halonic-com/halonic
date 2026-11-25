import type { SavedDocsLogEntry } from "@halonicjs/ports";

/**
 * The site card's words and the docs log's line under a `read_docs` call
 * (`assistant.build.site-card`). Copy check HAL-18542; a failed answer reads as the shell's
 * `failureLine("save your answer", …)`.
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
  /** The action in "Couldn't save your answer: …". */
  saveAnswer: "save your answer",
} as const;

/**
 * The docs log's one line for a `read_docs` call: what was asked for and how it ended. A `3xx`'s
 * `Location` is the site's own text, so it isn't shown; the model gets it in the tool's result.
 */
export function docsLogLine(entry: SavedDocsLogEntry): string {
  const { url, status } = entry;
  switch (entry.outcome) {
    case "read":
      return `Read ${url}, ${sizeOf(entry.bytes)}`;
    case "moved":
      // A browser hides a redirect's status as 0, which says nothing, so it isn't shown.
      return `Not read: ${url} moved to another address${status ? ` (${status})` : ""}`;
    case "not-read":
      return notReadLine(url, status);
    case "waiting":
      return `Waiting for your answer: ${url}`;
    case "declined":
      return `Not read: ${url}, because you didn't allow this site`;
    case "refused":
      return `Not read: ${url}. The assistant reads only public https pages, without a query.`;
    case "untrusted":
      return `Not read: ${url}, because this workspace isn't trusted`;
  }
}

/**
 * Why a page wasn't read, from its status alone: none means it didn't load (a timeout or a failed
 * request), a `2xx` means a type that isn't text or a page over the limit, and any other is the
 * site's error.
 */
function notReadLine(url: string, status: number | undefined): string {
  if (status === undefined) return `Not read: couldn't load ${url}`;
  if (status >= 200 && status < 300) {
    return `Not read: ${url} isn't a web page or text file under 1 MB`;
  }
  return `Not read: the site sent an error for ${url} (${status})`;
}

/** Bytes as the log line says them: "1 byte", "512 bytes", "12 KB". */
function sizeOf(bytes: number): string {
  if (bytes === 1) return "1 byte";
  return bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes / 1024)} KB`;
}
