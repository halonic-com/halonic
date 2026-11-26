import { type PaperclipRequestName, paperclipRequests } from "./requests.ts";

/**
 * How one Paperclip call went, for the sync service's measurements (HAL-19201): the route as the
 * request list writes it, never the address, an ID, the query, a header or the body
 * (`paperclip-client.route-timing`).
 */
export interface RouteTiming {
  method: string;
  /** The route template without `/api/`, such as `issues/:task`. */
  route: string;
  /** The HTTP status, or `offline` when no answer came. */
  status: number | "offline";
  /** From sending the request until its answer was read, in milliseconds. */
  ms: number;
  /** How many bytes of the answer's body were read. */
  bytes: number;
}

/** Where the transport hands each call's {@link RouteTiming}. */
export type RouteTimingSink = (timing: RouteTiming) => void;

/** The route template of request `name`, without `/api/`: the list's own text, so it holds no ID. */
export function routeOf(name: PaperclipRequestName): string {
  return paperclipRequests[name].path.replace(/^\/api\//, "");
}

/** One log line for `timing`, such as `paperclip GET issues/:task 200 312 ms 18944 B`. */
export function routeTimingLine(timing: RouteTiming): string {
  const ms = Math.round(timing.ms);
  return `paperclip ${timing.method} ${timing.route} ${timing.status} ${ms} ms ${timing.bytes} B`;
}

/** Hands each timing to `log` as one {@link routeTimingLine}. */
export function logRouteTimings(log: (line: string) => void): RouteTimingSink {
  return (timing) => log(routeTimingLine(timing));
}

/** The statuses a `Response` can't be built with a body for. */
const noBody: ReadonlySet<number> = new Set([101, 204, 205, 304]);

/**
 * Counts the bytes of a response's body as its reader reads it, without reading it twice or
 * holding it: the body passes through unchanged, so a reader's own size cap still applies.
 */
export class CountedResponse {
  readonly response: Response;
  #bytes = 0;

  constructor(response: Response) {
    // A redirect the client refuses has no body to count, and a status 0 or a no-body status
    // (204, 205, 304) couldn't be rebuilt with one.
    if (
      response.body === null ||
      response.type === "opaqueredirect" ||
      noBody.has(response.status)
    ) {
      this.response = response;
      return;
    }
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        this.#bytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    this.response = new Response(response.body.pipeThrough(counter), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  /** The bytes read so far. */
  get bytes(): number {
    return this.#bytes;
  }
}
