import type { PluginMetricsClient } from "@paperclipai/plugin-sdk";
import type { GitHubGet } from "../pr-watcher/github.ts";

/**
 * The numbers for the before/after comparison in the tools plan (HAL-15920):
 * Paperclip monitors that fire on tasks, the watcher's wakes and dones, tool
 * calls, and the GitHub requests behind each. The host puts the plugin's id
 * in front of every name.
 */

/** The part of the plugin context that writes metrics, so tests can fake it. */
export interface MetricsApi {
  readonly metrics: Pick<PluginMetricsClient, "write">;
}

/** A GitHub reader that counts its requests, failed ones included. */
export function countingGet(get: GitHubGet): { get: GitHubGet; requests: () => number } {
  let requests = 0;
  return {
    get: (path) => {
      requests += 1;
      return get(path);
    },
    requests: () => requests,
  };
}

/**
 * Writes each value with the same tags. Returns the first error instead of
 * throwing: a metric that doesn't save must not fail the job or the tool call.
 */
export async function writeMetrics(
  ctx: MetricsApi,
  values: Readonly<Record<string, number>>,
  tags: Readonly<Record<string, string>>,
): Promise<Error | undefined> {
  let failure: Error | undefined;
  for (const [name, value] of Object.entries(values)) {
    try {
      await ctx.metrics.write(name, value, { ...tags });
    } catch (error) {
      failure ??= error as Error;
    }
  }
  return failure;
}
