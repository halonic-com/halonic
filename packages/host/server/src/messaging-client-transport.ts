import type { MessagingRefusal } from "@halonicjs/ports";
import { messagingPathPrefix } from "./messaging-routes.ts";
import { messagingRefusals } from "./messaging-wire.ts";

/** Hosts that may be reached over plain `http`: this computer only. */
const loopbackHosts: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

/** Why the client stopped: an address or token it won't use, a redirect, or an answer it can't read. */
export type ServerClientFailure =
  | "unsafe-address"
  | "bad-token"
  | "redirect"
  | "access-refused"
  | "bad-answer";

/** A Cloudflare Access service token: sent as headers to the paired origin, and nowhere else. */
export interface AccessToken {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** A header can't carry a line break or a control character; fetch would fail as if offline. */
const headerSafe = /^[\x21-\x7e]{1,512}$/;

/** The two Access headers for `access`, or none. @throws ServerClientError when a value can't be sent */
export function accessHeaders(access: AccessToken | undefined): Record<string, string> {
  if (access === undefined) return {};
  if (!headerSafe.test(access.clientId) || !headerSafe.test(access.clientSecret)) {
    throw new ServerClientError(
      "The Access client ID or secret can't be sent: it holds a character a header can't carry.",
      "bad-token",
    );
  }
  return { "CF-Access-Client-Id": access.clientId, "CF-Access-Client-Secret": access.clientSecret };
}

/** Whether an answer is the Access check's own refusal: a 403 that isn't the server's JSON. */
export function isAccessRefusal(response: Response): boolean {
  return response.status === 403 && !(response.headers.get("content-type") ?? "").includes("json");
}

/**
 * Thrown when the client can't go on. Its message names the call and the
 * HTTP status at most: never the token, a header or the body of an answer
 * (`server.messaging-client`).
 */
export class ServerClientError extends Error {
  readonly reason: ServerClientFailure | MessagingRefusal;

  constructor(message: string, reason: ServerClientFailure | MessagingRefusal) {
    super(message);
    this.name = "ServerClientError";
    this.reason = reason;
  }
}

/**
 * The origin every request goes to. The address must be `https`, or plain
 * `http` to this computer, so the token never crosses a network in the clear.
 * It may not hold a user name, a password, a path, a query or a fragment, so
 * nothing but the origin decides where a request goes.
 */
export function checkedServerOrigin(address: string): string {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw unsafe("it isn't a web address.");
  }
  if (url.protocol === "http:" && !loopbackHosts.includes(url.hostname)) {
    throw unsafe("plain http is allowed only to this computer; use https.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw unsafe("use https.");
  if (url.username !== "" || url.password !== "") {
    throw unsafe("it holds a user name or password.");
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    throw unsafe("give only the scheme, host and port.");
  }
  return url.origin;
}

function unsafe(reason: string): ServerClientError {
  return new ServerClientError(`The server address can't be used: ${reason}`, "unsafe-address");
}

/** Sends one request; the platform's `fetch` by default, the server's own `handle` in tests. */
export type ServerFetch = (request: Request) => Promise<Response>;

/** What one call gave: the server's good answer, or the port's refusal it stands for. */
export type ServerAnswer =
  | { kind: "ok"; response: Response }
  | { kind: "refused"; reason: MessagingRefusal };

/**
 * Sends the messaging calls to one server, with the device's token in the
 * `Authorization` header only, and the Access service token, when given, in
 * its two Access headers. It follows no redirect, same host included,
 * and leaves certificate checks to the platform's `fetch`.
 */
export class ServerConnection {
  readonly #origin: string;
  readonly #token: string;
  readonly #fetch: ServerFetch;
  readonly #access: Record<string, string>;

  constructor(address: string, token: string, send: ServerFetch, access?: AccessToken) {
    this.#origin = checkedServerOrigin(address);
    // A header can't carry a line break or a control character; fetch would fail as if offline.
    if (!/^[\x21-\x7e]+$/.test(token)) {
      throw new ServerClientError(
        "The device token can't be sent: it holds a character a header can't carry.",
        "bad-token",
      );
    }
    this.#token = token;
    this.#fetch = send;
    this.#access = accessHeaders(access);
  }

  /** The origin calls go to, which names the server in a source the client stands in for. */
  get origin(): string {
    return this.#origin;
  }

  /**
   * Calls `/api/messaging/<call>`. No answer means `offline`, a 401 means
   * `signed-out`, and a refusal's code is the port's refusal. For `changes`
   * only, a 5xx answer without a refusal's code also means `offline`, so the
   * reader waits and opens it again. A redirect or any other error throws.
   */
  async send(method: "GET" | "POST", call: string, body?: unknown): Promise<ServerAnswer> {
    const headers: Record<string, string> = {
      accept: call === "changes" ? "text/event-stream" : "application/json",
      authorization: `Bearer ${this.#token}`,
      // Every request goes to the paired origin and no redirect is followed, so these never leave it.
      ...this.#access,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    let response: Response;
    try {
      response = await this.#fetch(
        new Request(new URL(`${messagingPathPrefix}${call}`, this.#origin), {
          method,
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          redirect: "manual",
        }),
      );
    } catch {
      // The platform's error can name the address; "offline" is all a caller needs.
      return { kind: "refused", reason: "offline" };
    }
    return read(method, call, response);
  }
}

async function read(method: string, call: string, response: Response): Promise<ServerAnswer> {
  // Cloudflare's `Response` types leave out `opaqueredirect`, which the platform's `fetch` gives.
  const type: string = response.type;
  if (type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel();
    throw new ServerClientError(
      `The server answered ${method} ${call} with a redirect, which the client never follows.`,
      "redirect",
    );
  }
  if (response.ok) return { kind: "ok", response };
  if (isAccessRefusal(response)) {
    await response.body?.cancel();
    throw new ServerClientError(
      `The server's access check refused ${method} ${call} with ${response.status}.`,
      "access-refused",
    );
  }
  if (response.status === 401) {
    await response.body?.cancel();
    return { kind: "refused", reason: "signed-out" };
  }
  const code = await errorCode(response);
  if (code !== undefined && (messagingRefusals as readonly string[]).includes(code)) {
    return { kind: "refused", reason: code as MessagingRefusal };
  }
  // A reverse proxy answers 502 or 503 while the server restarts; `changes` waits that out.
  if (call === "changes" && response.status >= 500) return { kind: "refused", reason: "offline" };
  throw new ServerClientError(
    `The server answered ${method} ${call} with ${response.status}.`,
    "bad-answer",
  );
}

/** The `code` of an error body, and nothing else of it. */
async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const { code } = (await response.json()) as { code?: unknown };
    return typeof code === "string" ? code : undefined;
  } catch {
    // An error without a JSON body has no code; the caller treats it as an unknown error.
    return undefined;
  }
}
