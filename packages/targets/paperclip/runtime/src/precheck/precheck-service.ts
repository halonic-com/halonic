/**
 * The client for Halonic's precheck service, as `halonic.precheck` gets it.
 * It knows two requests, `POST /check` and `GET /check/<id>`, on the origin
 * from the plugin's settings (see precheck-origin.ts), and nothing else: no
 * other path, no redirect, no answer above `maxAnswerBytes`.
 */

/** A `fetch` as the client calls it; tests pass their own. */
export type PrecheckFetch = (
  url: string,
  init: {
    readonly method: "GET" | "POST";
    readonly headers: Record<string, string>;
    readonly body?: string;
    readonly redirect: "error";
    readonly signal: AbortSignal;
  },
) => Promise<Response>;

/** One request to the service gives up after this long; it answers in milliseconds. */
export const requestTimeoutMs = 2_000;

/** The most of one answer the client reads. A check's answer is a few kilobytes. */
export const maxAnswerBytes = 64 * 1024;

/** A check id as the service gives it. */
export const checkIdPattern = /^[0-9a-f]{12}$/;

/** Thrown when the service can't take or report a check; the agent goes on without it. */
export class PrecheckUnavailable extends Error {}

/** One answer: its status and its JSON body, or `{}` when the body isn't a JSON object. */
export interface PrecheckAnswer {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/** The two requests the action may send. */
export interface PrecheckService {
  /** Starts a check of a pushed branch without waiting for it. */
  readonly start: (input: {
    readonly branch: string;
    readonly sha?: string;
  }) => Promise<PrecheckAnswer>;
  /** Reads a check by its id. */
  readonly read: (checkId: string) => Promise<PrecheckAnswer>;
}

/** Reads at most `maxAnswerBytes` of a body; more is refused before any parsing. */
async function cappedText(response: Response): Promise<string> {
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxAnswerBytes) {
      await reader.cancel();
      throw new PrecheckUnavailable(
        `the precheck service's answer is larger than ${maxAnswerBytes / 1024} KB`,
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * The capped body. A service that stalls or drops the connection after its headers is
 * unavailable like one that can't be reached, so a failed read isn't an error for the agent.
 */
async function answerText(response: Response): Promise<string> {
  try {
    return await cappedText(response);
  } catch (error) {
    if (error instanceof PrecheckUnavailable) {
      throw error;
    }
    throw new PrecheckUnavailable(
      `the precheck service's answer couldn't be read (${(error as Error).message})`,
    );
  }
}

/** The body as a JSON object, or `{}`: an answer that isn't one is judged by its status. */
function jsonObject(text: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * The service client on one origin.
 *
 * @param origin - the checked origin from the plugin's settings, such as `http://halonic-precheck:8787`
 * @param fetch - the Web-standard `fetch`; tests pass a fake
 */
export function precheckService(origin: string, fetch: PrecheckFetch): PrecheckService {
  const request = async (
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: string },
  ): Promise<PrecheckAnswer> => {
    let response: Response;
    try {
      response = await fetch(`${origin}${path}`, {
        ...init,
        headers: init.body === undefined ? {} : { "content-type": "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (error) {
      throw new PrecheckUnavailable(
        `the precheck service can't be reached (${(error as Error).message})`,
      );
    }
    // `redirect: "error"` makes `fetch` throw on a redirect; a fake or a manual answer still lands here.
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new PrecheckUnavailable(`the precheck service answered ${response.status}`);
    }
    return { status: response.status, body: jsonObject(await answerText(response)) };
  };
  return {
    start: (input) =>
      // The branch and sha go in the body, never in the address.
      request("/check", { method: "POST", body: JSON.stringify({ ...input, wait: false }) }),
    read: async (checkId) => {
      if (!checkIdPattern.test(checkId)) {
        throw new Error("a check id must be 12 lowercase hex characters.");
      }
      return request(`/check/${checkId}`, { method: "GET" });
    },
  };
}
