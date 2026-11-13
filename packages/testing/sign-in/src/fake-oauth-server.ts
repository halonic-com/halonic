import type { Clock, HttpClient } from "@halonicjs/ports";
import { GrantLedger } from "./grant-ledger.ts";
import { type ProviderBehavior, wellBehaved } from "./provider-behavior.ts";
import { ProviderEndpoints } from "./provider-endpoints.ts";
import { carries, type RecordedRequest, recordRequest } from "./recorded-request.ts";

/** What a test says about the fake provider. The defaults are the names the sheets in these tests use. */
export interface FakeOAuthServerOptions {
  readonly clock: Clock;
  /** Where the authorize page, the token and the revoke endpoint are. Default `auth.example.com`. */
  readonly authHost?: string;
  /** The resource server, which accepts the access tokens. Default `api.example.com`. */
  readonly apiHost?: string;
  readonly clientId?: string;
  /** The client secret the provider requires. `undefined` makes it a public client. Default a fake one. */
  readonly clientSecret?: string | undefined;
}

/** What a user does at the authorize page. */
export interface BrowserChoice {
  /** `deny` sends the browser back with `error=access_denied`. */
  readonly user?: "approve" | "deny";
  /** Replaces the `state` the callback carries; `null` leaves it out. */
  readonly state?: string | null;
  /** Replaces the `code`; for a callback that carries a code nobody issued. */
  readonly code?: string;
  /** Replaces the `iss` the callback carries; `null` leaves it out. */
  readonly iss?: string | null;
  /** More query parameters on the callback. */
  readonly extra?: Readonly<Record<string, string>>;
}

/** Answers a request to a host the test took over. Return `undefined` to let the provider answer it. */
export type HostHandler = (
  request: RecordedRequest,
) => Response | Promise<Response | undefined> | undefined;

/**
 * A fake OAuth provider: an authorize page, a token endpoint, a revoke
 * endpoint and a resource server, all in memory. It is an `HttpClient`, so
 * it stands where the host's client and the kit's transport go, and it
 * records every request it gets.
 *
 * It behaves like a strict provider (PKCE, single-use codes, client
 * authentication, optional refresh token rotation with reuse detection), so
 * a flow that sends something wrong fails here as it would at a real one.
 * `behavior` makes it hostile on purpose.
 *
 * @example
 * const server = createFakeOAuthServer({ clock });
 * const callback = server.approve(started.authorizeUrl);
 * server.behavior.answerFields["token_type"] = "mac";
 */
export interface FakeOAuthServer {
  /** The client for the host's sign-in code and, cast to the kit's transport type, for the kit. */
  readonly http: HttpClient;
  readonly behavior: ProviderBehavior;
  readonly authHost: string;
  readonly apiHost: string;
  readonly clientId: string;
  readonly clientSecret: string | undefined;
  /** Every request the provider received, in order. */
  readonly requests: readonly RecordedRequest[];
  /** What the provider made and what it would still accept. */
  readonly ledger: GrantLedger;
  /** The user at the authorize page: checks the request the way a provider does, and gives the URL the browser comes back to. */
  approve(authorizeUrl: string, choice?: BrowserChoice): URL;
  /** Takes over every request to `host`. The provider's own hosts can be taken over too. */
  handle(host: string, handler: HostHandler): void;
  /** Holds every token answer until the returned function is called, so a test can send requests at once. */
  holdTokenAnswers(): () => void;
  /** The requests that carry `value` anywhere, as it is, URL-encoded or JSON-escaped. */
  requestsCarrying(value: string): RecordedRequest[];
  /** The requests to the token endpoint with this grant type. */
  tokenRequests(grantType: "authorization_code" | "refresh_token"): RecordedRequest[];
  /** The requests to the revoke endpoint. */
  revokeRequests(): RecordedRequest[];
  /** Whether the provider would accept this access token now. */
  accessTokenWorks(token: string): boolean;
}

/** Creates the fake provider. */
export function createFakeOAuthServer(options: FakeOAuthServerOptions): FakeOAuthServer {
  const authHost = options.authHost ?? "auth.example.com";
  const apiHost = options.apiHost ?? "api.example.com";
  const clientId = options.clientId ?? "fake-client";
  const clientSecret = "clientSecret" in options ? options.clientSecret : "fake-client-secret-0000";
  const behavior = wellBehaved();
  const ledger = new GrantLedger();
  const requests: RecordedRequest[] = [];
  const handlers = new Map<string, HostHandler>();
  let gate: Promise<void> | undefined;
  const nowMs = () => options.clock.now().getTime();
  const endpoints = new ProviderEndpoints({
    ledger,
    behavior,
    clientId,
    clientSecret,
    nowMs,
    gate: async () => await gate,
  });

  const http: HttpClient = {
    async fetch(url, init) {
      init?.signal?.throwIfAborted();
      const request = await recordRequest(url, init);
      requests.push(request);
      const taken = await handlers.get(request.url.host)?.(request);
      if (taken !== undefined) return taken;
      if (request.url.host === authHost) return await authServer(request);
      if (request.url.host === apiHost) return endpoints.resource(request);
      return new Response("ok");
    },
  };

  function approve(authorizeUrl: string, choice: BrowserChoice = {}): URL {
    const url = new URL(authorizeUrl);
    const problem = authorizeProblem(url, clientId, authHost);
    if (problem !== undefined) {
      throw new Error(`The fake provider refuses the authorize request: ${problem}`);
    }
    const query = url.searchParams;
    const back = new URL(query.get("redirect_uri") as string);
    setIfPresent(back, "state", choice.state === undefined ? query.get("state") : choice.state);
    setIfPresent(back, "iss", choice.iss === undefined ? behavior.issuer : choice.iss);
    if (choice.user === "deny") {
      back.searchParams.set("error", "access_denied");
    } else {
      back.searchParams.set("code", choice.code ?? issueCode(query));
    }
    for (const [name, value] of Object.entries(choice.extra ?? {})) {
      back.searchParams.set(name, value);
    }
    return back;
  }

  function issueCode(query: URLSearchParams): string {
    const code = `fake-code-${String(ledger.next("code")).padStart(4, "0")}-${"c".repeat(8)}`;
    ledger.codes.set(code, {
      code,
      clientId,
      redirectUri: query.get("redirect_uri") as string,
      challenge: query.get("code_challenge") as string,
      scope: query.get("scope") ?? "",
      used: false,
    });
    return code;
  }

  async function authServer(request: RecordedRequest): Promise<Response> {
    const path = request.url.pathname;
    if (request.method !== "POST")
      return new Response("Use the authorize page in a browser.", { status: 405 });
    if (path.endsWith("/token")) return await endpoints.token(request);
    if (path.endsWith("/revoke")) return endpoints.revoke(request);
    return new Response("not found", { status: 404 });
  }

  return {
    http,
    behavior,
    authHost,
    apiHost,
    clientId,
    clientSecret,
    requests,
    ledger,
    approve,
    handle: (host, handler) => void handlers.set(host, handler),
    holdTokenAnswers() {
      let release: () => void = () => undefined;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    requestsCarrying: (value) => requests.filter((request) => carries(request, value)),
    tokenRequests: (grantType) =>
      requests.filter(
        (request) =>
          request.url.pathname.endsWith("/token") && request.form["grant_type"] === grantType,
      ),
    revokeRequests: () => requests.filter((request) => request.url.pathname.endsWith("/revoke")),
    accessTokenWorks: (token) => ledger.accessTokenWorks(token, nowMs()),
  };
}

/** Why the provider would refuse this authorize request, or `undefined` when it is good. */
function authorizeProblem(url: URL, clientId: string, authHost: string): string | undefined {
  const query = url.searchParams;
  const redirectUri = query.get("redirect_uri") ?? "";
  if (url.host !== authHost) return `${url.host} is not the provider's host`;
  if (query.get("response_type") !== "code") return "response_type isn't code";
  if (query.get("client_id") !== clientId) return "client_id isn't the provider's client";
  if (!redirectUri.startsWith("http://127.0.0.1:")) return "redirect_uri isn't a loopback address";
  if ((query.get("state") ?? "") === "") return "state is missing";
  if (query.get("code_challenge_method") !== "S256") return "code_challenge_method isn't S256";
  if ((query.get("code_challenge") ?? "") === "") return "code_challenge is missing";
  return undefined;
}

/** Sets a query parameter unless the value is `undefined` or `null`, which leave it out. */
function setIfPresent(url: URL, name: string, value: string | null | undefined): void {
  if (value !== undefined && value !== null) {
    url.searchParams.set(name, value);
  }
}
