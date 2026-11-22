import type { PluginStateClient } from "@paperclipai/plugin-sdk";
import { type Snapshot, snapshotVersion } from "./shape.ts";

/**
 * Where the snapshot lives between passes: one plugin state entry per
 * company, replaced whole by each `pr.watch` pass. Readers such as
 * `queue_state` and `merge_speed` load it from here instead of asking GitHub.
 */

/** The part of the plugin context that keeps state, so tests can fake it. */
export interface StateApi {
  readonly state: Pick<PluginStateClient, "get" | "set">;
}

function key(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "github",
    stateKey: "snapshot",
  } as const;
}

/** Saves a company's snapshot over the one before. */
export async function saveSnapshot(
  ctx: StateApi,
  companyId: string,
  snapshot: Snapshot,
): Promise<void> {
  await ctx.state.set(key(companyId), snapshot);
}

/**
 * A company's last snapshot, or undefined before the first pass. A snapshot
 * of another shape version is refused, not guessed at.
 */
export async function loadSnapshot(
  ctx: StateApi,
  companyId: string,
): Promise<Snapshot | undefined> {
  const stored = (await ctx.state.get(key(companyId))) as { version?: unknown } | null;
  if (stored === null) {
    return undefined;
  }
  if (stored.version !== snapshotVersion) {
    throw new Error(
      `GitHub snapshot: stored version ${String(stored.version)}, this code reads ${snapshotVersion}.`,
    );
  }
  return stored as Snapshot;
}
