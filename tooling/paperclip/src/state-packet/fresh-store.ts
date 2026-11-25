import type { PluginStateClient } from "@paperclipai/plugin-sdk";
import type { FreshLines } from "./build.ts";
import type { PullLine } from "./pull-line.ts";

/**
 * Where the state packet keeps the lines it read again from GitHub: one
 * plugin state entry per pull request, next to the watcher's snapshot. Not
 * in the snapshot itself, because every watcher pass replaces that whole and
 * would race the write. The packet takes whichever of the two is newer.
 */

/** The stored shape's version; another version is ignored, as if nothing were kept. */
const freshVersion = 1;

function key(companyId: string, repo: string, number: number) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "github",
    stateKey: `pull-fresh:${repo}#${number}`,
  } as const;
}

/** The kept lines in plugin state. A failed read or write fails the packet, never half of it. */
export function freshLines(ctx: {
  readonly state: Pick<PluginStateClient, "get" | "set">;
}): FreshLines {
  return {
    get: async (companyId, repo, number) => {
      const stored = (await ctx.state.get(key(companyId, repo, number))) as {
        version?: unknown;
        line?: PullLine;
      } | null;
      return stored?.version === freshVersion ? stored.line : undefined;
    },
    set: async (companyId, line) => {
      await ctx.state.set(key(companyId, line.repo, line.number), { version: freshVersion, line });
    },
  };
}
