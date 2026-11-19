import type { BridgeProviderAccess } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { Fetch } from "./pass-through.ts";

/** Where one API is served: its own origin, and the path of the call under a provider's `baseUrl`. */
export interface ProviderApi {
  /** The provider's name as people know it, for error messages. */
  name: string;
  /** The API's own host, such as `https://api.anthropic.com`. */
  ownOrigin: string;
  /** The call's path at the API's own host, such as `/v1/messages`. */
  ownPath: string;
  /** The call's path under the path of a `baseUrl`, which already ends without a slash. */
  pathUnder(basePath: string): string;
}

/** The two ways the bridge reaches providers. */
export interface ProviderFetches {
  /** Reaches the APIs' own hosts and no others. */
  fetch: Fetch;
  /**
   * Reaches a compatible provider at the address its file names. Left out,
   * the bridge refuses every call of an agent whose access names a `baseUrl`.
   */
  compatibleFetch?: Fetch | undefined;
}

/** Where one call goes, and the `fetch` that may reach it. */
export interface ProviderTarget {
  url: URL;
  fetch: Fetch;
  /**
   * True when the call goes to a compatible provider's `baseUrl`, where the
   * bridge sends only what it knows (requirement `harness-bridge.compatible-request`).
   */
  atCompatibleProvider: boolean;
  /** At a compatible provider, the only models the bridge sends it calls for. */
  models?: readonly string[] | undefined;
}

/**
 * Where one call of this agent goes, with the program's `search` (its query,
 * such as Claude Code's `?beta=true`) kept, and which `fetch` calls it.
 * Without a `baseUrl`, the API's own host through `fetches.fetch`, which
 * reaches only those hosts. With one, the address under it, through
 * `fetches.compatibleFetch` (requirement `harness-bridge.provider-base-url`).
 * The `baseUrl` comes only from the access the host gave, never from the
 * program's request, and the address keeps its scheme, host and port, so
 * the key that goes with it reaches no other origin; the call itself
 * refuses a redirect (`harness-bridge.pass-through`). Call this before the
 * key is read, so a refused address never reads it.
 *
 * @throws KindedError `invalid_input` when the `baseUrl` isn't an `https`
 *   address, or an `http` one on this computer, or holds a user name, a
 *   password, a query or a fragment
 * @throws KindedError `denied` when the bridge has no `compatibleFetch`
 */
export function providerTarget(
  access: BridgeProviderAccess,
  api: ProviderApi,
  search: string,
  fetches: ProviderFetches,
): ProviderTarget {
  const baseUrl = access.kind === "key" ? access.baseUrl : undefined;
  if (baseUrl === undefined) {
    return {
      url: new URL(`${api.ownPath}${search}`, api.ownOrigin),
      fetch: fetches.fetch,
      atCompatibleProvider: false,
    };
  }

  const base = readBaseUrl(baseUrl, api.name);
  // Only the path changes, so the origin is the base's own whatever its host is called.
  const path = api.pathUnder(base.pathname.replace(/\/+$/, ""));
  const url = new URL(`${base.origin}${path}${search}`);
  if (url.origin !== base.origin) {
    // Can't happen for a base that passed the checks above; kept so a later
    // change to the paths can never send the key to another origin.
    throw new KindedError("invalid_input", `The ${api.name} address left its own origin.`);
  }
  if (fetches.compatibleFetch === undefined) {
    throw new KindedError(
      "denied",
      `This bridge doesn't call ${api.name}-compatible providers at their own address.`,
    );
  }
  const models = access.kind === "key" ? access.models : undefined;
  return { url, fetch: fetches.compatibleFetch, atCompatibleProvider: true, models };
}

/**
 * The provider file's `baseUrl` as a URL the bridge may build calls on. The
 * error names the provider, never the address: a mistyped address can hold
 * a key in its user name.
 */
function readBaseUrl(baseUrl: string, name: string): URL {
  const base = URL.parse(baseUrl);
  if (base === null || !isPlainAddress(base) || !isSafeScheme(base)) {
    throw new KindedError(
      "invalid_input",
      `The ${name}-compatible provider's baseUrl isn't an https address (or an http one on this computer) without a user name, password, query or fragment.`,
    );
  }
  return base;
}

/** True for an address with nothing in it but a scheme, a host and a path. */
function isPlainAddress(base: URL): boolean {
  return base.username === "" && base.password === "" && base.search === "" && base.hash === "";
}

/**
 * `https`, or `http` to this computer only: a key sent over plain `http`
 * anywhere else can be read on the way.
 */
function isSafeScheme(base: URL): boolean {
  if (base.protocol === "https:") return true;
  return base.protocol === "http:" && isLoopbackHost(base.hostname);
}

/**
 * `localhost`, an address in `127.0.0.0/8` or `::1`, as the workspace's cost
 * rules count this computer. `URL` has already written an IPv4 address in
 * four dotted parts and an IPv6 one in brackets, so `127.1` and
 * `[0:0::1]` count, and `127.0.0.1.example.com` doesn't.
 */
function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" || /^127(\.\d{1,3}){3}$/.test(hostname);
}
