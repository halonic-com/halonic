// How `read_docs` fetches one page (`assistant.build.read-docs`): a GET with
// only a fixed `Accept` and `User-Agent`, no redirect followed, and limits on
// time and size that hold even when the site sends slowly or without end.

import type { HttpClient } from "@halonicjs/ports";
import { decodeUtf8 } from "@halonicjs/std";
import type { DocsOptions } from "./docs-sites.ts";

/** How long one page may take in all, the whole body included. */
export const docsTimeLimitMs = 15_000;

/** The most bytes of one page that are read, after decompression. */
export const docsSizeLimit = 1024 * 1024;

/** The only headers a docs request has: no cookie, no key, no `Authorization`. */
export const docsRequestHeaders: Readonly<Record<string, string>> = {
  Accept: "text/html, text/markdown, text/plain;q=0.9",
  "User-Agent": "Halonic docs reader",
};

/** The page types that are read. */
export type PageType = "text/html" | "text/plain" | "text/markdown";

const pageTypes: readonly string[] = ["text/html", "text/plain", "text/markdown"];

/** What came of one fetch. */
export type Fetched =
  | {
      readonly kind: "page";
      readonly status: number;
      readonly type: PageType;
      readonly text: string;
      readonly bytes: number;
    }
  | { readonly kind: "moved"; readonly status: number; readonly location: string | undefined }
  | { readonly kind: "status"; readonly status: number }
  | { readonly kind: "not-text"; readonly status: number; readonly type: string }
  | { readonly kind: "too-large"; readonly status: number; readonly bytes: number }
  | {
      readonly kind: "timeout" | "failed";
      readonly status?: number | undefined;
      readonly bytes: number;
    };

/** Ends a wait early when the time limit is up. */
class TimeUp extends Error {}

/**
 * Fetches `url`, already checked by `checkDocsUrl`, within the limits.
 *
 * @param signal - the chat's own stop, which ends the fetch as a failure
 */
export async function fetchDocsPage(
  options: Pick<DocsOptions, "http" | "timeLimit">,
  url: string,
  signal?: AbortSignal,
): Promise<Fetched> {
  const limit = options.timeLimit(docsTimeLimitMs);
  let status: number | undefined;
  let bytes = 0;
  try {
    const response = await untilTimeUp(
      request(options.http, url, limit.signal),
      limit.signal,
      signal,
    );
    status = response.status;
    const answer = beforeTheBody(response, url);
    if (answer !== undefined) {
      await response.body?.cancel().catch(() => undefined);
      return answer;
    }
    const type = typeOf(response) as PageType;
    const read = await readLimited(response, limit.signal, signal, (count) => {
      bytes = count;
    });
    if (read === "too-large") return { kind: "too-large", status, bytes };
    return { kind: "page", status, type, text: read.text, bytes: read.bytes };
  } catch (error) {
    return { kind: error instanceof TimeUp ? "timeout" : "failed", status, bytes };
  } finally {
    limit.stop();
  }
}

function request(http: HttpClient, url: string, signal: AbortSignal): Promise<Response> {
  return http.fetch(url, {
    method: "GET",
    headers: { ...docsRequestHeaders },
    redirect: "manual",
    signal,
  });
}

/** The answer when the body isn't read at all: a redirect, a status that isn't 2xx, a type or a length that's refused. */
function beforeTheBody(response: Response, url: string): Fetched | undefined {
  const { status } = response;
  // A browser's `fetch` gives `opaqueredirect` with status 0 and hides where to.
  if ((status >= 300 && status < 400) || response.type === "opaqueredirect") {
    return { kind: "moved", status, location: locationOf(response, url) };
  }
  if (status < 200 || status >= 300) return { kind: "status", status };
  const type = typeOf(response);
  if (!pageTypes.includes(type)) return { kind: "not-text", status, type };
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > docsSizeLimit) return { kind: "too-large", status, bytes: 0 };
  return undefined;
}

function typeOf(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/** The longest `Location` passed on; the site writes it, so it is kept short. */
const longestLocation = 2048;

/**
 * Where a `3xx` points, read against the page's own address, without its fragment. One with a
 * space or control character, or longer than {@link longestLocation}, counts as none.
 */
function locationOf(response: Response, url: string): string | undefined {
  const location = response.headers.get("location")?.trim();
  if (location === undefined || location === "" || location.length > longestLocation) {
    return undefined;
  }
  if (/[\p{Cc}\p{Cf}\s]/u.test(location)) return undefined;
  return absoluteAddress(location, url).split("#")[0];
}

/** `location` read against `url`: as it is when it has a scheme, else on its host or folder. */
function absoluteAddress(location: string, url: string): string {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(location)) return location;
  if (location.startsWith("//")) return `https:${location}`;
  if (location.startsWith("/")) return `${/^https:\/\/[^/]+/u.exec(url)?.[0] ?? ""}${location}`;
  return `${url.slice(0, url.lastIndexOf("/") + 1)}${location}`;
}

/** Reads the body up to {@link docsSizeLimit}, giving up when the time is up or the chat stops. */
async function readLimited(
  response: Response,
  limit: AbortSignal,
  signal: AbortSignal | undefined,
  counted: (bytes: number) => void,
): Promise<{ text: string; bytes: number } | "too-large"> {
  const reader = response.body?.getReader();
  if (reader === undefined) return { text: "", bytes: 0 };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await untilTimeUp(reader.read(), limit, signal);
      if (next.done) break;
      bytes += next.value.byteLength;
      counted(bytes);
      if (bytes > docsSizeLimit) return "too-large";
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const all = new Uint8Array(bytes);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return { text: decodeUtf8(all), bytes };
}

/**
 * Waits for `work`, but rejects as soon as the time limit or the chat's stop aborts, even when
 * the client or the stream doesn't listen to the signal.
 */
function untilTimeUp<T>(
  work: Promise<T>,
  limit: AbortSignal,
  stop: AbortSignal | undefined,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeUp = (): void => reject(new TimeUp());
    const stopped = (): void => reject(new Error("stopped"));
    if (limit.aborted) return timeUp();
    if (stop?.aborted === true) return stopped();
    limit.addEventListener("abort", timeUp, { once: true });
    stop?.addEventListener("abort", stopped, { once: true });
    work.then(resolve, reject).finally(() => {
      limit.removeEventListener("abort", timeUp);
      stop?.removeEventListener("abort", stopped);
    });
  });
}
