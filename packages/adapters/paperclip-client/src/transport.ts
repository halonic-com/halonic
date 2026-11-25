import { messageWorkReasonMax } from "@halonicjs/ports";
import { checkedOrigin } from "./address.ts";
import { asRecord, field, text } from "./json.ts";
import {
  buildPath,
  fitsBody,
  fitsSegment,
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
      /** On a document conflict, the document's current revision, which an update must name. */
      currentRevisionId?: string | undefined;
      /** On a refusal, Paperclip's own one-line error text, for a work line's reason. Never logged. */
      detail?: string | undefined;
      /** On a refusal, the HTTP status, so a caller can tell a 403 from a server fault. */
      status?: number | undefined;
    };

/**
 * Thrown when the client can't go on: a redirect, an unsafe ID or address,
 * or a read that failed. Its message names the request and the HTTP status
 * only, never the address's key, a request header or the body of a failed
 * answer (`agent-host.paperclip-key`).
 */
export class PaperclipClientError extends Error {
  readonly reason: PaperclipFailure | "redirect" | "bad-answer" | "bad-key";

  constructor(message: string, reason: PaperclipFailure | "redirect" | "bad-answer" | "bad-key") {
    super(message);
    this.name = "PaperclipClientError";
    this.reason = reason;
  }
}

/**
 * Hands the key to one request, or answers `signed-out` and runs nothing. The
 * engine's guard compares the connection file with the address and company
 * the key was made for before every request (`agent-host.paperclip-key`).
 */
export type PaperclipKeyGuard = (
  request: (key: string) => Promise<PaperclipAnswer>,
) => Promise<PaperclipAnswer>;

/** Where to send requests and with which key. The engine hands these in and keeps the key in memory. */
export interface TransportOptions {
  address: string;
  /** The key, or the guard that hands it to each request. */
  key: string | PaperclipKeyGuard;
  /** The `fetch` to use; the global one by default. */
  fetch?: typeof fetch;
}

/** One request's details beyond its name and path. */
export interface RequestDetails {
  path?: PathValues;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
}

/**
 * How a good answer's body is read: what the request accepts, and the reader. JSON by default;
 * an agent's picture is read as bytes (`avatars.ts`).
 */
export interface BodyReader {
  accept: string;
  read(name: PaperclipRequestName, response: Response): Promise<PaperclipAnswer>;
}

const jsonBody: BodyReader = {
  accept: "application/json",
  async read(name, response) {
    try {
      return { kind: "ok", body: await response.json() };
    } catch {
      const { method } = paperclipRequests[name];
      throw new PaperclipClientError(
        `Paperclip's answer to ${method} ${name} isn't JSON.`,
        "bad-answer",
      );
    }
  },
};

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
  readonly #guard: PaperclipKeyGuard;
  readonly #fetch: typeof fetch;

  constructor(options: TransportOptions) {
    this.#origin = checkedOrigin(options.address);
    const { key } = options;
    if (typeof key === "string") checkKey(key);
    this.#guard = typeof key === "string" ? (request) => request(key) : key;
    this.#fetch = options.fetch ?? fetch;
  }

  /** Sends request `name`. An unsafe ID throws before anything is sent. */
  send(name: PaperclipRequestName, details: RequestDetails = {}): Promise<PaperclipAnswer> {
    return this.sendReading(name, details, jsonBody);
  }

  /**
   * Sends request `name` and reads a good answer's body with `reader`, for a read that isn't
   * JSON. Every rule of {@link send} still holds: the list, the key's one header, no redirect.
   */
  async sendReading(
    name: PaperclipRequestName,
    details: RequestDetails,
    reader: BodyReader,
  ): Promise<PaperclipAnswer> {
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
    // A row that pins its body sends that body or nothing.
    if (!fitsBody(name, details.body)) {
      throw new PaperclipClientError(`${method} ${name} can't send that body.`, "refused");
    }
    return this.#guard((key) => this.#sendWith(key, name, url, details.body, reader));
  }

  async #sendWith(
    key: string,
    name: PaperclipRequestName,
    url: URL,
    body: unknown,
    reader: BodyReader,
  ): Promise<PaperclipAnswer> {
    checkKey(key);
    const { method } = paperclipRequests[name];
    const headers: Record<string, string> = {
      accept: reader.accept,
      authorization: `Bearer ${key}`,
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers,
        body: body === undefined ? null : JSON.stringify(body),
        redirect: "manual",
      });
    } catch {
      // The platform's error can name the address; "offline" is all a caller needs.
      return { kind: "failed", failure: "offline" };
    }
    return this.#read(name, response, reader);
  }

  async #read(
    name: PaperclipRequestName,
    response: Response,
    reader: BodyReader,
  ): Promise<PaperclipAnswer> {
    const { method } = paperclipRequests[name];
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      throw new PaperclipClientError(
        `Paperclip answered ${method} ${name} with a redirect, which the client never follows.`,
        "redirect",
      );
    }
    if (response.ok) {
      return reader.read(name, response);
    }
    const failure = statusFailures.get(response.status) ?? "refused";
    if (failure === "conflict") {
      return { kind: "failed", failure, ...(await conflictDetails(response)) };
    }
    if (failure === "refused") {
      return {
        kind: "failed",
        failure,
        status: response.status,
        ...(await refusalDetail(response)),
      };
    }
    await response.body?.cancel();
    return { kind: "failed", failure };
  }
}

/** The longest error text kept from a refusal; the port's work-line reason is no longer. */
const detailMax = messageWorkReasonMax;

/** Paperclip's `error` text from a refusal, on one line and cut short; nothing else of the body. */
async function refusalDetail(response: Response): Promise<{ detail?: string }> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // A refusal without a JSON body has no text; the caller shows the refusal without a reason.
    return {};
  }
  const detail = text(asRecord(body), "error")
    ?.replace(/\p{Cc}+/gu, " ")
    .trim()
    .slice(0, detailMax);
  return detail === undefined || detail === "" ? {} : { detail };
}

/** A header can't carry a line break or a control character; fetch would fail as if offline. */
function checkKey(key: string): void {
  if (!/^[\x21-\x7e]+$/.test(key)) {
    throw new PaperclipClientError(
      "The Paperclip key can't be sent: it holds a character a header can't carry.",
      "bad-key",
    );
  }
}

/**
 * Paperclip's short error code from a conflict, if it has a plain one, and a
 * document's current revision, if it is one; nothing else of the body is kept.
 */
async function conflictDetails(
  response: Response,
): Promise<{ code: string | undefined; currentRevisionId?: string }> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // A conflict without a JSON body has no code; the caller treats it as a plain conflict.
    return { code: undefined };
  }
  const record = asRecord(body);
  const code = text(record, "code");
  const revision = text(asRecord(field(record, "details")), "currentRevisionId");
  return {
    code: code !== undefined && /^[a-z_]{1,64}$/.test(code) ? code : undefined,
    ...(revision !== undefined && fitsSegment("revision", revision)
      ? { currentRevisionId: revision }
      : {}),
  };
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
