import { RemoteHostError, readHostError } from "./errors.ts";

/** Sends one request; the global `fetch` by default. A test passes `server.handle` of an in-memory host. */
export type Fetcher = (request: Request) => Promise<Response>;

/** What a call to the host carries. */
export interface HostCall {
  readonly method: "GET" | "POST";
  /** Sent as the JSON body of a POST. */
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly headers?: Readonly<Record<string, string>>;
}

/** The cookie to send back from a login response: its `name=value` pair, without the attributes. */
function sessionCookieOf(response: Response): string | null {
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";", 1)[0]?.trim() ?? "";
    // A cookie with `Max-Age=0` is the host ending a session, not starting one.
    if (pair.includes("=") && !/;\s*max-age=0\b/i.test(header)) {
      return pair;
    }
  }
  return null;
}

/** How long a sign-in may take before it is given up as a failed try. */
const defaultLoginTimeoutMs = 30_000;

/**
 * Talks to one host: keeps the session cookie by hand, because `fetch` has no
 * cookie jar outside a browser, and signs in again when the host answers 401.
 * It holds the password only to sign in; it never puts it in an error.
 */
export class HostClient {
  readonly #baseUrl: string;
  readonly #password: string | undefined;
  readonly #fetch: Fetcher;
  readonly #loginTimeoutMs: number;
  #cookie: string | null = null;
  #signingIn: Promise<void> | null = null;

  constructor(
    baseUrl: string,
    password: string | undefined,
    fetcher: Fetcher,
    loginTimeoutMs = defaultLoginTimeoutMs,
  ) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#password = password;
    this.#fetch = fetcher;
    this.#loginTimeoutMs = loginTimeoutMs;
  }

  /**
   * Calls the host. A 401 signs in (once, however many calls wait for it) and
   * repeats the call, so a session that expired mid-stream is renewed. Without a
   * password a 401 is returned as it is.
   */
  async call(path: string, call: HostCall): Promise<Response> {
    const first = await this.#once(path, call);
    if (first.status !== 401 || this.#password === undefined) {
      return first;
    }
    await first.body?.cancel();
    await this.#signIn();
    return this.#once(path, call);
  }

  async #once(path: string, { method, body, signal, headers }: HostCall): Promise<Response> {
    const sent = new Headers(headers);
    if (this.#cookie !== null) sent.set("Cookie", this.#cookie);
    if (body !== undefined) sent.set("Content-Type", "application/json");
    const init: RequestInit = { method, headers: sent, redirect: "error" };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (signal !== undefined) init.signal = signal;
    return this.#fetch(new Request(`${this.#baseUrl}${path}`, init));
  }

  #signIn(): Promise<void> {
    this.#signingIn ??= this.#login().finally(() => {
      this.#signingIn = null;
    });
    return this.#signingIn;
  }

  /** Signs in. A host that stops answering ends in a `TimeoutError` rejection, which counts as a try that can be repeated. */
  async #login(): Promise<void> {
    const response = await this.#once("/api/login", {
      method: "POST",
      body: { password: this.#password },
      signal: AbortSignal.timeout(this.#loginTimeoutMs),
    });
    if (!response.ok) {
      throw await readHostError(response);
    }
    const cookie = sessionCookieOf(response);
    if (cookie === null) {
      throw new RemoteHostError(
        response.status,
        "unexpected_response",
        "The host sent no session.",
      );
    }
    this.#cookie = cookie;
  }
}
