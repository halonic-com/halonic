import type { HttpClient } from "@halonicjs/ports";

/**
 * A recording file in the `halonic.recording/1` format that `pnpm record`
 * writes in the integrations repo (HAL-149): one scenario, its HTTP
 * exchanges in call order, scrubbed before it was saved. These types follow
 * that format exactly. Its schema moves into `@halonicjs/format` with the
 * permission sheet, and the suite then checks every file against it.
 */
export interface RecordingFile {
  readonly format: typeof recordingFormat;
  readonly integration: string;
  readonly scenario: string;
  readonly exchanges: readonly RecordedExchange[];
  readonly scrubReport: readonly { rule: string; path: string; count: number }[];
}

export const recordingFormat = "halonic.recording/1";

export interface RecordedExchange {
  readonly transport: "http";
  readonly request: {
    readonly method: string;
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: RecordedBody;
  };
  readonly response: {
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: RecordedBody;
  };
}

/** A body, saved parsed. `sse` is a streamed answer, one entry per event. */
export type RecordedBody =
  | { readonly kind: "empty" }
  | { readonly kind: "json"; readonly value: unknown }
  | { readonly kind: "form"; readonly value: readonly (readonly [string, string])[] }
  | { readonly kind: "text"; readonly contentType: string; readonly value: string }
  | { readonly kind: "sse"; readonly value: readonly { event: string; data: unknown }[] };

/** What the scrubber put where a key or the user's own content was. Matches any value on replay. */
const placeholders = new Set(["<scrubbed:secret>", "<scrubbed:content>"]);

/** A request as the replay transport saw it, with what the kit placed in it. */
export interface ReplayedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
}

/** The integration sent a request that the recording doesn't have at that point. Replays fail closed. */
export class NoRecordingError extends Error {
  override readonly name = "NoRecordingError";
}

/**
 * A transport that answers only from one recording, in order, and keeps
 * every request it saw. Each request must match the next exchange on method
 * and URL, and on body and key headers where the recording kept them; a
 * scrubbed placeholder matches any value. Anything else throws, so a test
 * can't reach the network by accident.
 *
 * @example
 * const replay = replayTransport(recording);
 * await replay.transport.fetch("https://api.example.com/v1"); // the first exchange's response
 * replay.unused(); // 0 once every exchange was asked for
 */
export function replayTransport(recording: RecordingFile | undefined): {
  transport: HttpClient;
  seen: ReplayedRequest[];
  unused: () => number;
} {
  if (recording !== undefined && recording.format !== recordingFormat) {
    throw new TypeError(`recording format "${String(recording.format)}" is not ${recordingFormat}`);
  }
  const exchanges = recording?.exchanges ?? [];
  const seen: ReplayedRequest[] = [];
  const transport: HttpClient = {
    async fetch(url, init = {}) {
      init.signal?.throwIfAborted();
      const method = (init.method ?? "GET").toUpperCase();
      const headers = Object.fromEntries(new Headers(init.headers));
      const body = init.body == null ? null : await new Response(init.body).text();
      seen.push({ method, url, headers, body });
      const position = seen.length - 1;
      const next = exchanges[position];
      const where = new URL(url);
      const mismatch =
        next === undefined
          ? "the recording has no more exchanges"
          : differs(next.request, { method, url: where, headers, body });
      if (mismatch !== undefined) {
        throw new NoRecordingError(
          `no recording for ${method} ${where.host}${where.pathname} as request ${position + 1}: ${mismatch}`,
        );
      }
      return replayResponse((next as RecordedExchange).response);
    },
  };
  return { transport, seen, unused: () => Math.max(0, exchanges.length - seen.length) };
}

interface Sent {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: string | null;
}

/** Why the request doesn't match the recorded one, naming no values; undefined when it does. */
function differs(recorded: RecordedExchange["request"], sent: Sent): string | undefined {
  if (recorded.method !== sent.method) return `the recording expects ${recorded.method}`;
  const expected = new URL(recorded.url);
  if (expected.origin !== sent.url.origin) return `the recording expects ${expected.host}`;
  if (!sameParts(pathParts(expected), pathParts(sent.url))) return "the path differs";
  if (!sameParts([...expected.searchParams], [...sent.url.searchParams]))
    return "the query differs";
  for (const [name, value] of Object.entries(recorded.headers)) {
    if (!hasPlaceholder(value)) continue;
    const actual = sent.headers[name];
    if (actual === undefined || !matchText(value, actual)) return `the ${name} header is missing`;
  }
  if (!matchBody(recorded.body, sent.body)) return "the body differs";
  return undefined;
}

function pathParts(url: URL): string[] {
  return url.pathname.split("/").map((part) => decodeURIComponent(part));
}

/** Same length, and each recorded part matches the sent one. Pairs compare name and value. */
function sameParts(recorded: readonly unknown[], sent: readonly unknown[]): boolean {
  return recorded.length === sent.length && recorded.every((part, i) => matchValue(part, sent[i]));
}

function matchBody(recorded: RecordedBody, sent: string | null): boolean {
  switch (recorded.kind) {
    case "empty":
      return sent === null || sent === "";
    case "json":
      try {
        return sent !== null && matchValue(recorded.value, JSON.parse(sent));
      } catch {
        return false;
      }
    case "form":
      return sameParts(recorded.value, [...new URLSearchParams(sent ?? "")]);
    case "text":
      return matchText(recorded.value, sent ?? "");
    case "sse":
      return false;
  }
}

/**
 * Structural match. A placeholder string matches any string. User content
 * that was a number or a boolean was saved as `0` or `false`, so those match
 * any number or boolean.
 */
function matchValue(recorded: unknown, sent: unknown): boolean {
  if (typeof recorded === "string") return typeof sent === "string" && matchText(recorded, sent);
  if (recorded === 0) return typeof sent === "number";
  if (recorded === false) return typeof sent === "boolean";
  if (Array.isArray(recorded)) return Array.isArray(sent) && sameParts(recorded, sent);
  if (recorded !== null && typeof recorded === "object") {
    if (sent === null || typeof sent !== "object" || Array.isArray(sent)) return false;
    const keys = Object.keys(recorded);
    const sentKeys = Object.keys(sent);
    return (
      keys.length === sentKeys.length &&
      keys.every(
        (key) =>
          Object.hasOwn(sent, key) &&
          matchValue(
            (recorded as Record<string, unknown>)[key],
            (sent as Record<string, unknown>)[key],
          ),
      )
    );
  }
  return recorded === sent;
}

/** Equal, or equal once each placeholder in the recorded text stands for any text. */
function matchText(recorded: string, sent: string): boolean {
  if (!hasPlaceholder(recorded)) return recorded === sent;
  const pattern = recorded
    .split(/(<scrubbed:(?:secret|content)>)/)
    .map((piece) =>
      placeholders.has(piece) ? "[\\s\\S]*" : piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(`^${pattern}$`).test(sent);
}

function hasPlaceholder(text: string): boolean {
  return text.includes("<scrubbed:secret>") || text.includes("<scrubbed:content>");
}

function replayResponse(recorded: RecordedExchange["response"]): Response {
  const headers = new Headers(recorded.headers);
  const nullBody = recorded.status === 204 || recorded.status === 205 || recorded.status === 304;
  const { body, contentType } = responseBody(recorded.body);
  if (contentType !== undefined && !headers.has("content-type"))
    headers.set("content-type", contentType);
  return new Response(nullBody ? null : body, { status: recorded.status, headers });
}

function responseBody(body: RecordedBody): { body: string | null; contentType?: string } {
  switch (body.kind) {
    case "empty":
      return { body: null };
    case "json":
      return { body: JSON.stringify(body.value), contentType: "application/json" };
    case "form":
      return {
        body: new URLSearchParams(body.value.map(([name, value]) => [name, value])).toString(),
        contentType: "application/x-www-form-urlencoded",
      };
    case "text":
      return { body: body.value, contentType: body.contentType };
    case "sse":
      return { body: body.value.map(eventText).join(""), contentType: "text/event-stream" };
  }
}

/** One server-sent event as text: `data` that was parsed JSON is written back as JSON. */
function eventText({ event, data }: { event: string; data: unknown }): string {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const lines = text.split("\n").map((line) => `data: ${line}\n`);
  return `${event === "message" ? "" : `event: ${event}\n`}${lines.join("")}\n`;
}
