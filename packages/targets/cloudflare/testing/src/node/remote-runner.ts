import { type CaseResult, type SuiteNode, workerPaths } from "../worker/protocol.ts";

/**
 * The test Worker deployed to a real Cloudflare account, called over the network. It lists and
 * runs cases like {@link WorkerdRunner}, so `mirrorCases` shows them in Vitest the same way
 * (HAL-6703). The token is sent only to `baseUrl`, and never put in an error.
 */
export class RemoteRunner {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  /**
   * @param baseUrl - the Worker's address, such as its `workers.dev` URL
   * @param token - the Worker's `HALONIC_TEST_RUNNER_TOKEN`
   * @param fetchImpl - tests inject this
   */
  constructor(baseUrl: string, token: string, fetchImpl: typeof fetch = fetch) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#token = token;
    this.#fetch = fetchImpl;
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

  async #call(pathname: string, method: string, body?: string): Promise<unknown> {
    const response = await this.#fetch(`${this.#baseUrl}${pathname}`, {
      method,
      headers: { authorization: `Bearer ${this.#token}` },
      ...(body === undefined ? {} : { body }),
      // A case waits on real R2, D1 and Durable Object round trips.
      signal: AbortSignal.timeout(55_000),
    });
    if (!response.ok) {
      throw new Error(
        `The test Worker answered ${method} ${pathname} with ${response.status}: ${(await response.text()).slice(0, 500)}`,
      );
    }
    return response.json();
  }
}
