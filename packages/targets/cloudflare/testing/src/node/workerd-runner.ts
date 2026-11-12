import { Miniflare } from "miniflare";
import { type CaseResult, type SuiteNode, workerPaths } from "../worker/protocol.ts";

/**
 * The compatibility date the test Worker runs with. It can't be later than
 * the bundled workerd's own date, so it moves when `miniflare` is updated.
 */
export const compatibilityDate = "2026-07-30";

/**
 * Every kind of storage kept in memory only, never on disk. Each runner is
 * a fresh workerd, so each test file starts with empty D1, R2, KV and
 * Durable Object storage, and no case finds what an earlier run left.
 * These are Miniflare's defaults; they're spelled out so a change shows.
 */
const inMemoryStorage = {
  d1Persist: false,
  r2Persist: false,
  kvPersist: false,
  durableObjectsPersist: false,
  cachePersist: false,
} as const;

/**
 * The Worker's address for `dispatchFetch`. Miniflare still opens a loopback
 * port for the Worker; `dispatchFetch` just bypasses it, so the host name
 * here is never resolved.
 */
const workerOrigin = "http://test-worker.invalid";

/**
 * The test Worker running in a local workerd through Miniflare. Start it
 * with {@link WorkerdRunner.start}, and always {@link WorkerdRunner.stop}
 * it, or the workerd process stays behind.
 */
export class WorkerdRunner {
  readonly #miniflare: Miniflare;

  private constructor(miniflare: Miniflare) {
    this.#miniflare = miniflare;
  }

  /**
   * Starts workerd with the given Worker script.
   *
   * @param script - an ES module Worker, from `buildTestWorker`
   * @returns the running Worker
   */
  static async start(script: string): Promise<WorkerdRunner> {
    const miniflare = new Miniflare({
      modules: true,
      script,
      compatibilityDate,
      ...inMemoryStorage,
    });
    try {
      await miniflare.ready;
    } catch (error) {
      await miniflare.dispose();
      throw error;
    }
    return new WorkerdRunner(miniflare);
  }

  /** Lists the cases the Worker's suites registered. */
  async cases(): Promise<SuiteNode> {
    return (await this.#fetchJson(workerPaths.cases, { method: "GET" })) as SuiteNode;
  }

  /**
   * Runs one case inside workerd.
   *
   * @param id - the case's ID from {@link cases}
   * @returns how the case ended
   */
  async run(id: string): Promise<CaseResult> {
    const body = JSON.stringify({ id });
    return (await this.#fetchJson(workerPaths.run, { method: "POST", body })) as CaseResult;
  }

  /** Stops workerd. */
  async stop(): Promise<void> {
    await this.#miniflare.dispose();
  }

  async #fetchJson(pathname: string, init: { method: string; body?: string }): Promise<unknown> {
    const response = await this.#miniflare.dispatchFetch(`${workerOrigin}${pathname}`, init);
    if (!response.ok) {
      throw new Error(
        `The test Worker answered ${init.method} ${pathname} with ${response.status}: ${await response.text()}`,
      );
    }
    return response.json();
  }
}
