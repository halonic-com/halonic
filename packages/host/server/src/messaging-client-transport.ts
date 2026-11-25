import type { MessagingRefusal } from "@halonicjs/ports";
import { messagingPathPrefix } from "./messaging-routes.ts";
import { messagingRefusals } from "./messaging-wire.ts";

/** Hosts that may be reached over plain `http`: this computer only. */
const loopbackHosts: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

/** Why the client stopped: an address or token it won't use, a redirect, or an answer it can't read. */
export type ServerClientFailure = "unsafe-address" | "bad-token" | "redirect" | "bad-answer";

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
 * `Authorization` header only. It follows no redirect, same host included,
 * and leaves certificate checks to the platform's `fetch`.
 */
export class ServerConnection {
  readonly #origin: string;
  readonly #token: string;
  readonly #fetch: ServerFetch;

  constructor(address: string, token: string, send: ServerFetch) {
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
  }

  /** The origin calls go to, which names the server in a source the client stands in for. */
  get origin(): string {
    return this.#origin;
  }

  /**
   * Calls `/api/messaging/<call>`. No answer means `offline`, a 401 means
   * `signed-out`, and a refusal's code is the port's refusal. A redirect or
   * any other error throws.
   */
  async send(method: "GET" | "POST", call: string, body?: unknown): Promise<ServerAnswer> {
    const headers: Record<string, string> = {
      accept: call === "changes" ? "text/event-stream" : "application/json",
      authorization: `Bearer ${this.#token}`,
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
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel();
    throw new ServerClientError(
      `The server answered ${method} ${call} with a redirect, which the client never follows.`,
      "redirect",
    );
  }
  if (response.ok) return { kind: "ok", response };
  if (response.status === 401) {
    await response.body?.cancel();
    return { kind: "refused", reason: "signed-out" };
  }
  const code = await errorCode(response);
  if (code !== undefined && (messagingRefusals as readonly string[]).includes(code)) {
    return { kind: "refused", reason: code as MessagingRefusal };
  }
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
