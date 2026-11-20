import { type CaseResult, type SuiteNode, workerPaths } from "../worker/protocol.ts";
import { edgeAttempts, edgeWaitMs, isEdgeNotFound } from "./edge-not-found.ts";

/** One call's whole budget, tries included: a case waits on real R2, D1 and Durable Object round trips. */
const callBudgetMs = 55_000;

/** How a {@link RemoteRunner} waits; tests inject `sleep`. */
export interface RemoteRunnerOptions {
  readonly sleep?: (ms: number) => Promise<void>;
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
   * Asks again while Cloudflare's edge answers its own not-found page (see `edge-not-found.ts`).
   * Such a request never reached the Worker, so asking again can't run a case twice.
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
      await this.#sleep(edgeWaitMs(attempt));
      if (signal.aborted) throw error;
    }
  }
}
