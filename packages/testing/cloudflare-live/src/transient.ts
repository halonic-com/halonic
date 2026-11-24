import type { CaseResult, CaseRunner } from "@halonicjs/target-cloudflare-testing";

/** How the live suite asks Cloudflare again; tests inject `fetch`, `sleep` and `log`. */
export interface TransientOptions {
  /** How many times to send a request or run a case, the first included. Defaults to 4 and 3. */
  readonly attempts?: number;
  /** Milliseconds before the second try; each later wait doubles. Defaults to 2000. */
  readonly delayMs?: number;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Told about each try that is asked again. Defaults to `console.log`. */
  readonly log?: (line: string) => void;
}

/** The longest wait a 429's `Retry-After` can ask for. */
const maxRetryAfterMs = 30_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Cloudflare's own failures, which it asks to try again: any 5xx, and 429. */
function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

type FetchInput = Parameters<typeof fetch>[0];

/** The request's path, with the account id left out of the log. */
function pathOf(input: FetchInput): string {
  const url = new URL(input instanceof Request ? input.url : String(input));
  return url.pathname.replace(/^(.*\/accounts\/)[^/]+/, "$1<account>");
}

function waitFor(response: Response, delayMs: number): number {
  const asked = Number(response.headers.get("retry-after"));
  if (response.status !== 429 || !Number.isFinite(asked) || asked <= 0) return delayMs;
  return Math.min(Math.max(asked * 1000, delayMs), maxRetryAfterMs);
}

/** After one try: the answer to return, or why to ask again, how long to wait and what came back. */
type Step =
  | { readonly done: Response }
  | { readonly why: string; readonly waitMs: number; readonly kept?: Response };

/** Sends once. Throws a connection failure on the last try or when the request's time ran out. */
async function tryOnce(
  doFetch: typeof fetch,
  input: FetchInput,
  init: RequestInit | undefined,
  waitMs: number,
  last: boolean,
): Promise<Step> {
  let response: Response;
  try {
    response = await doFetch(input, init);
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    if (timedOut || last) throw error;
    return { why: "failed to connect for", waitMs };
  }
  if (!isTransient(response.status) || last) return { done: response };
  return {
    why: `answered ${response.status} to`,
    waitMs: waitFor(response, waitMs),
    // Read now, so the answer can still be returned if the request's time runs out while waiting.
    kept: new Response(await response.arrayBuffer(), response),
  };
}

/**
 * A `fetch` for the live suite's Cloudflare clients that asks again, after 2, 4 and 8 seconds, when
 * Cloudflare answers 5xx or 429 or the connection fails, so one hiccup of the API doesn't fail a
 * merge group (HAL-17662). A request whose own time ran out is not sent again: the last answer is
 * returned as it came. Only for the live suite: a retried POST that Cloudflare did carry out fails
 * the second time, which fails the suite as the first answer would have.
 *
 * @example
 * const api = createCloudflareClient({ token, fetch: retryTransient() });
 */
export function retryTransient(options: TransientOptions = {}): typeof fetch {
  const {
    attempts = 4,
    delayMs = 2_000,
    fetch: doFetch = fetch,
    sleep = defaultSleep,
    log = console.log,
  } = options;
  return async (input, init) => {
    const said = (attempt: number, what: string, ms: number) =>
      log(
        `Cloudflare ${what} ${init?.method ?? "GET"} ${pathOf(input)}; asking again in ${ms / 1000} s (try ${attempt + 1} of ${attempts}).`,
      );
    for (let attempt = 1; ; attempt++) {
      const wait = delayMs * 2 ** (attempt - 1);
      const step = await tryOnce(doFetch, input, init, wait, attempt >= attempts);
      if ("done" in step) return step.done;
      said(attempt, step.why, step.waitMs);
      await sleep(step.waitMs);
      if (step.kept !== undefined && init?.signal?.aborted === true) return step.kept;
    }
  };
}

/** The message a Worker's call to D1, R2 or a Durable Object fails with when Cloudflare itself failed. */
const internalError = /\binternal error; reference = [a-z0-9]+/i;

/** The edge's own error page for a workers.dev address it briefly can't route: the Worker never ran. */
const scriptNotFound = /answered POST \S+ with 5\d\d: [\s\S]*<title>Script not found\b/;

/** What one run of a case gave, as a reason to run it again, or `undefined` when it counts. */
async function runOnce(
  runner: CaseRunner,
  id: string,
  last: boolean,
): Promise<{ readonly result: CaseResult } | { readonly again: string }> {
  let result: CaseResult;
  try {
    result = await runner.run(id);
  } catch (error) {
    if (last || !(error instanceof Error) || !scriptNotFound.test(error.message)) throw error;
    return { again: "got the edge's Script not found page" };
  }
  if (last || result.status !== "failed" || !internalError.test(result.message ?? "")) {
    return { result };
  }
  return { again: `hit a Cloudflare internal error (${result.message})` };
}

/**
 * Runs a contract case again when it failed only because of Cloudflare itself: the Worker's call
 * failed with Cloudflare's own "internal error; reference = …", or the edge answered its "Script
 * not found" page instead of the Worker (HAL-17662). Any other failure, and the last try's,
 * counts as it came, so a real bug still fails.
 */
export function retryInternalErrors(
  runner: CaseRunner,
  options: TransientOptions = {},
): CaseRunner {
  const { attempts = 3, delayMs = 2_000, sleep = defaultSleep, log = console.log } = options;
  return {
    async run(id: string): Promise<CaseResult> {
      for (let attempt = 1; ; attempt++) {
        const outcome = await runOnce(runner, id, attempt >= attempts);
        if ("result" in outcome) return outcome.result;
        log(`Case ${id} ${outcome.again}; running it again (try ${attempt + 1} of ${attempts}).`);
        await sleep(delayMs * 2 ** (attempt - 1));
      }
    },
  };
}
