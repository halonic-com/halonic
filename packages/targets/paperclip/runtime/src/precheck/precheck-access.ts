import type { RuntimeHost } from "../host.ts";
import { precheckOrigin } from "./precheck-origin.ts";
import { type PrecheckFetch, type PrecheckService, precheckService } from "./precheck-service.ts";

/**
 * What a call of `halonic.precheck`, and no other action, gets: the service
 * client on the origin from the plugin's settings, a clock, a pause and its
 * metrics. The runtime builds it only for that action (see register.ts), so
 * no other handler can reach the plain `fetch` behind it.
 */

/** The verdicts the action counts, `error` included. */
export type PrecheckVerdict = "pass" | "fail" | "running" | "unavailable" | "error";

/** The precheck part of one call. */
export interface PrecheckAccess {
  /** The client, or why the plugin's `precheckUrl` setting is refused. */
  readonly service: PrecheckService | { readonly refused: string };
  readonly sleep: (ms: number) => Promise<void>;
  /** Milliseconds, for the call's wait budget. */
  readonly clock: () => number;
  /** Saves one call's verdict and, for a finished check, how long the check took. Best effort. */
  readonly record: (verdict: PrecheckVerdict, checkDurationS?: number) => Promise<void>;
}

/** What `precheckAccess` takes besides the host; tests replace all three. */
export interface PrecheckDeps {
  readonly fetch: PrecheckFetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly clock: () => number;
}

/** The Web-standard `fetch` and timers the worker runs with. */
export const realPrecheckDeps: PrecheckDeps = {
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  clock: () => Date.now(),
};

/**
 * Builds one call's precheck access, checking the settings' address first.
 *
 * @param tags - the company and the tool's name, for the metrics
 */
export function precheckAccess(
  ctx: Pick<RuntimeHost, "metrics">,
  config: Readonly<Record<string, unknown>>,
  tags: { readonly companyId: string; readonly tool: string },
  deps: PrecheckDeps = realPrecheckDeps,
): PrecheckAccess {
  const origin = precheckOrigin(config);
  return {
    service: "refused" in origin ? origin : precheckService(origin.origin, deps.fetch),
    sleep: deps.sleep,
    clock: deps.clock,
    record: async (verdict, checkDurationS) => {
      const verdictTags = { ...tags, result: verdict };
      try {
        await ctx.metrics.write(`precheck.${verdict}`, 1, verdictTags);
        if (checkDurationS !== undefined) {
          await ctx.metrics.write("precheck.duration_s", checkDurationS, verdictTags);
        }
      } catch {
        // Counting is best effort by design: a metrics outage must not fail an agent's tool call.
      }
    },
  };
}
