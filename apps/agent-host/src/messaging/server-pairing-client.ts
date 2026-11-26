import { checkedServerOrigin } from "@halonicjs/host-server";
import { parse, type Schema, s } from "@halonicjs/schema-kit";

/** Why a pairing call to the server got no usable answer. */
export type PairingTrouble =
  /** No answer at all, a 5xx, or an answer it can't read: the server may answer later. */
  | "unreachable"
  /** `GET /api/hello` didn't answer like a Halonic server, or a call was redirected. */
  | "not_halonic"
  /** 404: the server doesn't know this pending ID (used, guessed, or its answer was lost). */
  | "lost"
  /** 401 to `POST /api/pair`: the code is wrong, used or older than 10 minutes. */
  | "code_refused";

/** Whether the server answers this device: as a messaging source's state names it. */
export type ServerReach = "online" | "offline" | "signed-out";

/** How long the state route waits for the server's answer before it calls it offline. */
export const checkTimeoutMs = 5000;

/** What `POST /api/pair` gave. */
export type PairStart =
  | { kind: "pending"; pendingId: string; checkCode: string; expiresAt: string }
  | { kind: "too_many"; minutes?: number }
  | { kind: PairingTrouble };

/** What `POST /api/pair/status` gave: the server's ending names, as it sends them. */
export type PairPoll =
  | { kind: "waiting"; expiresAt: string }
  | { kind: "allowed"; token: string; sessionEndsAt: string }
  | { kind: "expired" | "refused" | "cancelled" | "taken-over" }
  | { kind: "too_many"; minutes?: number }
  | { kind: PairingTrouble };

const text = s.string().min(1).max(4096);
const helloAnswer = s.object({ product: s.literal("halonic") });
const pairAnswer = s.object({ pendingId: text, checkCode: text, expiresAt: text });
const waitingAnswer = s.object({ state: s.literal("waiting"), expiresAt: text });
const endedAnswer = s.discriminatedUnion("state", [
  s.object({ state: s.literal("allowed"), token: text, sessionEndsAt: text }),
  s.object({ state: s.enum(["expired", "refused", "cancelled", "taken-over"]) }),
]);

/**
 * The calls this computer makes to a Halonic server to pair with it
 * (`server.device-pairing`): no session for the pairing ones, the device's
 * own token for its sign-out. It follows no redirect, reads an answer's body
 * only when the status says it holds what was asked, and never puts what the
 * server or the platform said into what it gives back.
 */
export class ServerPairingClient {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  /** @throws ServerClientError when `address` isn't `https`, nor plain `http` to this computer */
  constructor(address: string, send: typeof fetch = fetch) {
    this.#origin = checkedServerOrigin(address);
    this.#fetch = send;
  }

  /** The origin every call goes to. */
  get origin(): string {
    return this.#origin;
  }

  /** Whether `GET /api/hello` answers as a Halonic server. */
  async hello(): Promise<"halonic" | "not_halonic" | "unreachable"> {
    const response = await this.#send("GET", "/api/hello");
    if (response === undefined) return "unreachable";
    if (response.status !== 200) return response.status >= 500 ? "unreachable" : "not_halonic";
    return (await read(response, helloAnswer)) === undefined ? "not_halonic" : "halonic";
  }

  /** `POST /api/pair` with the code the server's owner gave and this computer's name. */
  async pair(code: string, deviceName: string): Promise<PairStart> {
    const response = await this.#send("POST", "/api/pair", { code, deviceName });
    if (response === undefined) return { kind: "unreachable" };
    if (response.status === 401) return { kind: "code_refused" };
    const trouble = troubleOf(response);
    if (trouble !== undefined) return trouble;
    const started = response.status === 200 ? await read(response, pairAnswer) : undefined;
    if (started === undefined) return { kind: "not_halonic" };
    const { pendingId, checkCode, expiresAt } = started;
    return { kind: "pending", pendingId, checkCode, expiresAt };
  }

  /** `POST /api/pair/status`: what the request came to. Only `allowed` holds the token. */
  async status(pendingId: string): Promise<PairPoll> {
    const response = await this.#send("POST", "/api/pair/status", { pendingId });
    if (response === undefined) return { kind: "unreachable" };
    const trouble = troubleOf(response);
    if (trouble !== undefined) return trouble;
    if (response.status === 202) {
      const waiting = await read(response, waitingAnswer);
      return waiting === undefined
        ? { kind: "unreachable" }
        : { kind: "waiting", expiresAt: waiting.expiresAt };
    }
    const ended = response.status === 200 ? await read(response, endedAnswer) : undefined;
    if (ended === undefined) return { kind: "unreachable" };
    if (ended.state !== "allowed") return { kind: ended.state };
    return { kind: "allowed", token: ended.token, sessionEndsAt: ended.sessionEndsAt };
  }

  /** `POST /api/pair/cancel`: whether the server dropped the request (204) or had none (404). */
  async cancel(pendingId: string): Promise<boolean> {
    const response = await this.#send("POST", "/api/pair/cancel", { pendingId });
    return response?.status === 204 || response?.status === 404;
  }

  /** `POST /api/devices/sign-out` with the device's own token: whether the server ended it. */
  async signOut(token: string): Promise<boolean> {
    // A header can't carry a control character; such a token was never one the server gave.
    if (!/^[\x21-\x7e]+$/.test(token)) return false;
    const response = await this.#send("POST", "/api/devices/sign-out", undefined, token);
    return response?.status === 204 || response?.status === 401;
  }

  /**
   * `GET /api/messaging/sources` with the device's own token, as the hub's
   * server client lists them (`server.messaging-client`): `online` when it
   * answers, `signed-out` for a 401 (the server ended the pairing), and
   * `offline` for no answer within {@link checkTimeoutMs} or any other.
   */
  async check(token: string): Promise<ServerReach> {
    if (!/^[\x21-\x7e]+$/.test(token)) return "signed-out";
    const signal = AbortSignal.timeout(checkTimeoutMs);
    const response = await this.#send("GET", "/api/messaging/sources", undefined, token, signal);
    await response?.body?.cancel().catch(() => undefined);
    if (response === undefined) return "offline";
    if (response.status === 401) return "signed-out";
    return response.ok ? "online" : "offline";
  }

  /** One request; `undefined` when nothing answered or the answer was a redirect. */
  async #send(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    token?: string,
    signal?: AbortSignal,
  ): Promise<Response | undefined> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token !== undefined) headers["authorization"] = `Bearer ${token}`;
    try {
      const response = await this.#fetch(new URL(path, this.#origin), {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "manual",
        ...(signal === undefined ? {} : { signal }),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        return new Response(null, { status: 421 });
      }
      return response;
    } catch {
      // The platform's error can name the address; "unreachable" is all a caller needs.
      return undefined;
    }
  }
}

/** A 404, 429 or 5xx as what it means for a pairing; `undefined` for anything else. */
function troubleOf(
  response: Response,
): { kind: "lost" | "unreachable" } | { kind: "too_many"; minutes?: number } | undefined {
  if (response.status === 404) return { kind: "lost" };
  if (response.status === 429) {
    const seconds = Number(response.headers.get("retry-after"));
    return Number.isFinite(seconds) && seconds > 0
      ? { kind: "too_many", minutes: Math.ceil(seconds / 60) }
      : { kind: "too_many" };
  }
  if (response.status >= 500) return { kind: "unreachable" };
  return undefined;
}

/** The body as `schema` reads it, or `undefined`; the body is never quoted anywhere. */
async function read<T>(response: Response, schema: Schema<T>): Promise<T | undefined> {
  try {
    const parsed = parse(schema, await response.json());
    return parsed.ok ? (parsed.value as T) : undefined;
  } catch {
    return undefined;
  }
}
