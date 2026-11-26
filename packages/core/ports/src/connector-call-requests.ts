/**
 * One request a connector's tool call made, as Halonic's own request log
 * has it (requirement `ports.connector-call-requests`): never what the
 * connector's code said about it. Method, host, path, the final status and
 * why Halonic refused it; no query, header or body, and the log takes a
 * request's place only after its secret check passed, so it can't hold a
 * secret or a reply.
 */
export interface ConnectorCallRequest {
  /** The method in capitals, such as `GET` or `POST`. */
  readonly method: string;
  /** The host name in its ASCII (`xn--`) form, or an address. */
  readonly host: string;
  /**
   * The request's path, without its query, so the same request sent twice
   * can be told apart from two different ones. Never shown.
   */
  readonly path: string;
  /** The final status, after redirects. Absent when no response came. */
  readonly status?: number;
  /** Why Halonic refused the request before it left, such as `host-not-allowed`. */
  readonly refusal?: string;
  /** How many times Halonic had tried this request again before, such as after a 429. */
  readonly retry?: number;
}

/** The most requests the reader takes from one call; a call with more keeps its newest. */
export const maxConnectorCallRequests = 200;

/** How many errors deep, through `cause`, the reader looks for the requests. */
const maxCauseDepth = 8;

/**
 * The requests of the tool call that failed with `value`, oldest first, when
 * the connector put them on its error, or `undefined` when it didn't. A
 * connector says them with an `Error` whose `callRequests` holds them, here
 * or in the `cause` of the error it threw (as
 * `@halonicjs/adapter-integration-runner` does for a call to a local
 * integration). It reads them by field, not `instanceof`, so the engine needs
 * no adapter, and keeps only the fields above, each of the right type; an
 * entry with any field of the wrong type makes the whole list unreadable,
 * because a list with a gap could put the wrong request last.
 *
 * @example
 * connectorCallRequestsOf(Object.assign(new Error("No."), {
 *   callRequests: [{ method: "GET", host: "api.example.com", path: "/v1", status: 429 }],
 * }));
 * // => [{ method: "GET", host: "api.example.com", path: "/v1", status: 429 }]
 */
export function connectorCallRequestsOf(
  value: unknown,
): readonly ConnectorCallRequest[] | undefined {
  let error = value;
  for (let depth = 0; depth < maxCauseDepth && error instanceof Error; depth += 1) {
    const { callRequests } = error as { callRequests?: unknown };
    if (callRequests !== undefined) return readRequests(callRequests);
    error = error.cause;
  }
  return undefined;
}

function readRequests(value: unknown): readonly ConnectorCallRequest[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const requests: ConnectorCallRequest[] = [];
  for (const entry of value.slice(-maxConnectorCallRequests)) {
    const request = readRequest(entry);
    if (request === undefined) return undefined;
    requests.push(request);
  }
  return requests;
}

/** The fields an entry may have, each still unread. */
type RequestFields = Partial<Record<keyof ConnectorCallRequest, unknown>>;

function readRequest(value: unknown): ConnectorCallRequest | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { method, host, path, status, refusal, retry }: RequestFields = value;
  if (typeof method !== "string" || typeof host !== "string" || typeof path !== "string") {
    return undefined;
  }
  if (!isOptional(status, isWholeNumber) || !isOptional(retry, isWholeNumber)) return undefined;
  if (!isOptional(refusal, (text) => typeof text === "string")) return undefined;
  return {
    method,
    host,
    path,
    ...(status === undefined ? {} : { status: status as number }),
    ...(refusal === undefined ? {} : { refusal: refusal as string }),
    ...(retry === undefined ? {} : { retry: retry as number }),
  };
}

function isOptional(value: unknown, check: (value: unknown) => boolean): boolean {
  return value === undefined || check(value);
}

function isWholeNumber(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
}
