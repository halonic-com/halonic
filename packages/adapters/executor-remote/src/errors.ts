import { ModelCallError, type ModelCallErrorReason, modelCallErrorReasons } from "@halonicjs/ports";

/**
 * What a host answered when it refused a request: the status and the stable
 * `code` of its error body (`not_signed_in`, `event_not_accepted`, …). The
 * message is the host's own fixed sentence, so it never holds a secret, a
 * path or a stack, and neither does this error.
 */
export class RemoteHostError extends Error {
  override readonly name = "RemoteHostError";
  /** The HTTP status of the answer. */
  readonly status: number;
  /** The host's error code, or `unexpected_response` when the body wasn't an error body. */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** What the host sent was not what its own routes promise, such as an event that isn't JSON. Retrying would get the same. */
export class RemoteProtocolError extends Error {
  override readonly name = "RemoteProtocolError";
}

/** Reads the host's `{ code, message }` body of a refused request. */
export async function readHostError(response: Response): Promise<RemoteHostError> {
  const fallback = new RemoteHostError(
    response.status,
    "unexpected_response",
    `The host answered ${response.status}.`,
  );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fallback;
  }
  const { code, message } = (body ?? {}) as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string") {
    return fallback;
  }
  return new RemoteHostError(response.status, code, message);
}

/**
 * Reads a refused chat turn. A `model_call_failed` that names the reason of
 * the model call's failure becomes a `ModelCallError` with that reason again,
 * so a chat on a remote engine can say what to fix, such as a missing key, as
 * it does on a local one. Its message is the host's fixed sentence and its
 * cause the host's refusal. Anything else is the host's refusal as it is.
 */
export async function readChatTurnError(
  response: Response,
): Promise<RemoteHostError | ModelCallError> {
  const refusal = await readHostError(response.clone());
  const reason = refusal.code === "model_call_failed" ? await reasonOf(response) : undefined;
  return reason === undefined
    ? refusal
    : new ModelCallError(reason, refusal.message, { cause: refusal });
}

/** The `reason` of a `model_call_failed` body, when it is one a model call can fail with. */
async function reasonOf(response: Response): Promise<ModelCallErrorReason | undefined> {
  try {
    const { reason } = (await response.json()) as { reason?: unknown };
    return modelCallErrorReasons.find((known) => known === reason);
  } catch {
    return undefined;
  }
}

/**
 * Whether asking again can work: the host or the network was in trouble, not
 * the request. A refusal by the host with a 4xx status other than "too many
 * requests" would be refused again.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof RemoteProtocolError) {
    return false;
  }
  if (error instanceof RemoteHostError) {
    return error.status >= 500 || error.status === 429;
  }
  // `fetch` rejects with a `TypeError` when the connection fails or drops while the body streams.
  return true;
}
