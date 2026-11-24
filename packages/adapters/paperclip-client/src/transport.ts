import { checkedOrigin } from "./address.ts";
import {
  buildPath,
  matchesRequest,
  type PaperclipRequestName,
  type PathValues,
  paperclipRequests,
} from "./requests.ts";

/** Why a request didn't give an answer the client can use. */
export type PaperclipFailure = "offline" | "signed-out" | "not-found" | "conflict" | "refused";

/** What one request gave: its JSON, or why it failed. */
export type PaperclipAnswer =
  | { kind: "ok"; body: unknown }
  | {
      kind: "failed";
      failure: PaperclipFailure;
      /** Paperclip's error code on a conflict, such as `interaction_already_resolved`. Never logged. */
      code?: string | undefined;
    };

/**
 * Thrown when the client can't go on: a redirect, an unsafe ID or address,
 * or a read that failed. Its message names the request and the HTTP status
 * only, never the address's key, a request header or the body of a failed
 * answer (`ports.paperclip-key`).
 */
export class PaperclipClientError extends Error {
  readonly reason: PaperclipFailure | "redirect" | "bad-answer" | "bad-key";

  constructor(message: string, reason: PaperclipFailure | "redirect" | "bad-answer" | "bad-key") {
    super(message);
    this.name = "PaperclipClientError";
    this.reason = reason;
  }
}

/** Where to send requests and with which key. The engine hands these in and keeps the key in memory. */
export interface TransportOptions {
  address: string;
  key: string;
  /** The `fetch` to use; the global one by default. */
  fetch?: typeof fetch;
}

/** One request's details beyond its name and path. */
export interface RequestDetails {
  path?: PathValues;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
}

const statusFailures: ReadonlyMap<number, PaperclipFailure> = new Map([
  [401, "signed-out"],
  [404, "not-found"],
  [409, "conflict"],
]);

/**
 * Sends requests from the fixed list to one Paperclip server, with the key
 * in the `Authorization` header only. It follows no redirect, same host
 * included, and leaves certificate checks to the platform's `fetch`, which
 * has no switch to turn them off.
 */
export class PaperclipTransport {
  readonly #origin: string;
  readonly #key: string;
  readonly #fetch: typeof fetch;

  constructor(options: TransportOptions) {
    this.#origin = checkedOrigin(options.address);
    // A header can't carry a line break or a control character; fetch would fail as if offline.
    if (!/^[\x21-\x7e]+$/.test(options.key)) {
      throw new PaperclipClientError(
        "The Paperclip key can't be sent: it holds a character a header can't carry.",
        "bad-key",
      );
    }
    this.#key = options.key;
    this.#fetch = options.fetch ?? fetch;
  }

  /** Sends request `name`. An unsafe ID throws before anything is sent. */
  async send(name: PaperclipRequestName, details: RequestDetails = {}): Promise<PaperclipAnswer> {
    // A name from outside the list (only possible past the type checker) is refused here.
    if (!Object.hasOwn(paperclipRequests, name)) {
      throw new PaperclipClientError("That request isn't on the request list.", "refused");
    }
    const { method } = paperclipRequests[name];
    const url = new URL(buildPath(name, details.path ?? {}), this.#origin);
    for (const [key, value] of Object.entries(details.query ?? {})) {
      url.searchParams.set(key, value);
    }
    // The last gate before the network: the exact method and path must match the list.
    if (!matchesRequest(name, method, url.pathname)) {
      throw new PaperclipClientError(`${method} ${name} isn't on the request list.`, "refused");
    }
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${this.#key}`,
    };
    if (details.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers,
        body: details.body === undefined ? null : JSON.stringify(details.body),
        redirect: "manual",
      });
    } catch {
      // The platform's error can name the address; "offline" is all a caller needs.
      return { kind: "failed", failure: "offline" };
    }
    return this.#read(name, response);
  }

  async #read(name: PaperclipRequestName, response: Response): Promise<PaperclipAnswer> {
    const { method } = paperclipRequests[name];
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      throw new PaperclipClientError(
        `Paperclip answered ${method} ${name} with a redirect, which the client never follows.`,
        "redirect",
      );
    }
    if (response.ok) {
      try {
        return { kind: "ok", body: await response.json() };
      } catch {
        throw new PaperclipClientError(
          `Paperclip's answer to ${method} ${name} isn't JSON.`,
          "bad-answer",
        );
      }
    }
    const failure = statusFailures.get(response.status) ?? "refused";
    if (failure === "conflict") {
      return { kind: "failed", failure, code: await errorCode(response) };
    }
    await response.body?.cancel();
    return { kind: "failed", failure };
  }
}

/** Paperclip's short error code from a failed answer, if it has a plain one; nothing else of the body is kept. */
async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "code" in body) {
      const code = body.code;
      return typeof code === "string" && /^[a-z_]{1,64}$/.test(code) ? code : undefined;
    }
  } catch {
    // A conflict without a JSON body has no code; the caller treats it as a plain conflict.
  }
  return undefined;
}

/**
 * The body of answer `answer` to request `name`, or a thrown
 * {@link PaperclipClientError} for a failed read, so the engine can fall
 * back to its cache.
 */
export function bodyOf(name: PaperclipRequestName, answer: PaperclipAnswer): unknown {
  if (answer.kind === "ok") {
    return answer.body;
  }
  const { method } = paperclipRequests[name];
  throw new PaperclipClientError(
    `Paperclip ${method} ${name} failed: ${answer.failure}.`,
    answer.failure,
  );
}
