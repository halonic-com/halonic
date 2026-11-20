import { type CaseResult, type SuiteNode, workerPaths } from "../worker/protocol.ts";

/** One call's whole budget, tries included: a case waits on real R2, D1 and Durable Object round trips. */
const callBudgetMs = 55_000;
/** Tries while Cloudflare's edge answers not found: waits of 1, 2, 4 and then 8 s, about 40 s. */
const edgeAttempts = 8;
const longestWaitMs = 8_000;

/** How a {@link RemoteRunner} waits; tests inject `sleep`. */
export interface RemoteRunnerOptions {
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Whether the answer is Cloudflare's own HTML "Page not found" rather than the Worker's: an edge
 * server that doesn't route the new workers.dev address yet. The test Worker never answers HTML.
 */
function isEdgeNotFound(response: Response): boolean {
  return (
    response.status === 404 && (response.headers.get("content-type") ?? "").includes("text/html")
  );
}

/**
 * The test Worker deployed to a real Cloudflare account, called over the network. It lists and
 * runs cases like {@link WorkerdRunner}, so `mirrorCases` shows them in Vitest the same way
 * (HAL-6703). The token is sent only to `baseUrl`, and never put in an error.
 */
export class RemoteRunner {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;

  /**
   * @param baseUrl - the Worker's address, such as its `workers.dev` URL
   * @param token - the Worker's `HALONIC_TEST_RUNNER_TOKEN`
   * @param fetchImpl - tests inject this
   * @param options - tests inject `sleep`
   */
  constructor(
    baseUrl: string,
    token: string,
    fetchImpl: typeof fetch = fetch,
    options: RemoteRunnerOptions = {},
  ) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#token = token;
    this.#fetch = fetchImpl;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Lists the cases the Worker's suites registered. */
  async cases(): Promise<SuiteNode> {
    return (await this.#call(workerPaths.cases, "GET")) as SuiteNode;
  }

  /**
   * Runs one case on the account.
   *
   * @param id - the case's ID from {@link RemoteRunner.cases}
   */
  async run(id: string): Promise<CaseResult> {
    return (await this.#call(workerPaths.run, "POST", JSON.stringify({ id }))) as CaseResult;
  }

  /**
   * Right after a deploy, Cloudflare's edge servers learn a new workers.dev address one by one, so
   * for a while some requests get the edge's not-found page while others reach the Worker
   * (HAL-14022). Such a request never reached the Worker, so asking again can't run a case twice.
   */
  async #call(pathname: string, method: string, body?: string): Promise<unknown> {
    const signal = AbortSignal.timeout(callBudgetMs);
    for (let attempt = 1; ; attempt += 1) {
      const response = await this.#fetch(`${this.#baseUrl}${pathname}`, {
        method,
        headers: { authorization: `Bearer ${this.#token}` },
        ...(body === undefined ? {} : { body }),
        signal,
      });
      if (response.ok) return response.json();
      const error = new Error(
        `The test Worker answered ${method} ${pathname} with ${response.status}: ${(await response.text()).slice(0, 500)}`,
      );
      if (!isEdgeNotFound(response) || attempt >= edgeAttempts) throw error;
      await this.#sleep(Math.min(1000 * 2 ** (attempt - 1), longestWaitMs));
      if (signal.aborted) throw error;
    }
  }
}
