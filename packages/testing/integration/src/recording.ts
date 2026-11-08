import type { HttpClient } from "@halonicjs/ports";

/**
 * One recorded exchange. Recordings are scrubbed before they are written: no
 * auth headers, tokens, e-mail addresses or message bodies (plan 15.2). A
 * request is matched on method, URL and canonical body only, so it holds no
 * headers at all.
 */
export interface Recording {
  readonly request: {
    readonly method: string;
    readonly url: string;
    /** The body as text. JSON bodies match whatever their key order. */
    readonly body?: string;
  };
  readonly response: {
    readonly status: number;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body: string;
  };
}

/** A request as the replay transport saw it, with what the kit placed in it. */
export interface ReplayedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
}

/** The integration sent a request that no recording matches. Replays fail closed. */
export class NoRecordingError extends Error {
  override readonly name = "NoRecordingError";
}

/**
 * A transport that answers only from recordings and keeps every request it
 * saw. A request without a recording throws, so a test can't reach the
 * network by accident.
 *
 * @example
 * const replay = replayTransport([{ request: { method: "GET", url: "https://api.example.com/v1" }, response: { status: 200, body: "{}" } }]);
 * await replay.transport.fetch("https://api.example.com/v1"); // 200
 */
export function replayTransport(recordings: readonly Recording[]): {
  transport: HttpClient;
  seen: ReplayedRequest[];
} {
  const seen: ReplayedRequest[] = [];
  const transport: HttpClient = {
    async fetch(url, init = {}) {
      init.signal?.throwIfAborted();
      const method = (init.method ?? "GET").toUpperCase();
      const body = init.body == null ? null : await new Response(init.body).text();
      seen.push({ method, url, headers: Object.fromEntries(new Headers(init.headers)), body });
      const match = recordings.find(
        (r) =>
          r.request.method.toUpperCase() === method &&
          sameUrl(r.request.url, url) &&
          canonicalBody(r.request.body ?? null) === canonicalBody(body),
      );
      if (match === undefined) {
        const where = new URL(url);
        throw new NoRecordingError(`no recording for ${method} ${where.host}${where.pathname}`);
      }
      const { status, headers, body: text } = match.response;
      const nullBody = status === 204 || status === 205 || status === 304;
      return new Response(nullBody ? null : text, { status, headers: { ...headers } });
    },
  };
  return { transport, seen };
}

function sameUrl(recorded: string, sent: string): boolean {
  return new URL(recorded).href === new URL(sent).href;
}

/** JSON with sorted keys, or the text as it is. */
export function canonicalBody(body: string | null): string | null {
  if (body === null || body === "") return null;
  try {
    return JSON.stringify(sortKeys(JSON.parse(body)));
  } catch {
    return body;
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}
