import { afterEach, beforeEach, expect } from "vitest";

/** A `fetch` that refuses every address but this machine's, and the addresses it refused. */
export interface FetchTrap {
  fetch: typeof globalThis.fetch;
  /** Every address refused so far, in order. */
  reached(): readonly string[];
}

/**
 * Wraps `original` so that a request for an address that isn't this machine
 * is recorded and refused, and a loopback request, such as one to a test
 * server the binding starts, goes through.
 */
export function trapFetch(original: typeof globalThis.fetch): FetchTrap {
  const reached: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (isLoopbackUrl(url)) return original(input, init);
    reached.push(url);
    throw new Error(`The connector contract reaches no network, but fetch asked for ${url}.`);
  };
  return { fetch, reached: () => [...reached] };
}

/**
 * Fails every case of the calling `describe` whose adapter calls
 * `globalThis.fetch` for an address that isn't this machine, also when the
 * adapter catches the refusal. A connector reaches its service only through
 * the context's `http`, which the binding answers from recorded responses,
 * so a CI run never makes a live call.
 */
export function refuseRealNetwork(): void {
  let original = globalThis.fetch;
  let trap = trapFetch(original);

  beforeEach(() => {
    original = globalThis.fetch;
    trap = trapFetch(original);
    globalThis.fetch = trap.fetch;
  });

  afterEach(() => {
    globalThis.fetch = original;
    expect(trap.reached(), "the adapter reached the real network").toEqual([]);
  });
}

/** Whether `url` names this machine: `localhost`, `127.x.x.x` or `::1`. */
function isLoopbackUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "::1" || /^127\.\d+\.\d+\.\d+$/.test(host);
}
