import type { WorkspaceSnapshot } from "@halonicjs/format";
import type { GitHubGet } from "./github.ts";
import type { RuntimeHost, StateKey } from "./host.ts";
import { readPin } from "./pin.ts";
import { checkedSnapshot, fetchPinnedSnapshot, type SnapshotPin } from "./pinned-snapshot.ts";

/**
 * Which snapshot the plugin serves right now, per company:
 * 1. no pin in the settings: the snapshot built into the plugin;
 * 2. a pin: that snapshot once it passed its checks, kept as the last good one;
 * 3. a pin that can't be loaded (GitHub down, check not green, checksum
 *    wrong, snapshot refused): the last good snapshot, or the built-in one,
 *    unchanged. The plugin writes how long it has been stale and tries the
 *    pin again at most every 10 minutes.
 * It never fails open: what the chosen snapshot doesn't define is off.
 */

/** How long after a failed load the plugin tries the same pin again. */
export const retryAfterMs = 10 * 60 * 1000;

/** The part of the plugin context the runtime uses, so tests can fake it. */
export type RuntimeApi = Pick<RuntimeHost, "metrics" | "state">;

/** The snapshot to serve, and where it came from. */
export interface ActiveSnapshot {
  readonly snapshot: WorkspaceSnapshot;
  readonly source: "built-in" | "pinned" | "last-good";
  /** Why the pinned snapshot isn't served, when it isn't. */
  readonly staleReason?: string;
}

interface LastGood {
  readonly sha256: string;
  readonly snapshot: unknown;
}

interface Stale {
  readonly since: string;
  readonly triedAt: string;
  readonly pin: string;
  readonly reason: string;
}

function stateKey(companyId: string, key: "last-good" | "stale"): StateKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "workspace",
    stateKey: key,
  };
}

function pinId(pin: SnapshotPin): string {
  return `${pin.repo}@${pin.commit}#${pin.sha256}`;
}

/** The stored last good snapshot, checked again; one this runtime refuses counts as none. */
async function lastGood(ctx: RuntimeApi, companyId: string) {
  const stored = (await ctx.state.get(stateKey(companyId, "last-good"))) as LastGood | null;
  if (stored === null) {
    return undefined;
  }
  try {
    return { sha256: stored.sha256, snapshot: checkedSnapshot(stored.snapshot) };
  } catch {
    // A snapshot stored by an older runtime isn't guessed at; the pin is loaded again.
    return undefined;
  }
}

/** Serves the fallback and records why, writing the minutes stale as a metric. */
async function stale(
  ctx: RuntimeApi,
  companyId: string,
  fallback: ActiveSnapshot,
  record: Stale,
  now: Date,
): Promise<ActiveSnapshot> {
  await ctx.state.set(stateKey(companyId, "stale"), record);
  const minutes = Math.floor((now.getTime() - Date.parse(record.since)) / 60_000);
  try {
    await ctx.metrics.write("workspace.snapshot_stale_minutes", minutes, { companyId });
  } catch (error) {
    // A metric that doesn't save must not fail the tool call; the reason says so instead.
    const unsaved = `${record.reason} (the stale metric wasn't saved: ${(error as Error).message})`;
    return { ...fallback, staleReason: unsaved };
  }
  return { ...fallback, staleReason: record.reason };
}

/** The snapshot to serve for a company, by the rules above. */
export async function activeSnapshot(
  ctx: RuntimeApi,
  input: {
    readonly companyId: string;
    readonly config: Readonly<Record<string, unknown>>;
    readonly builtIn: WorkspaceSnapshot;
    readonly github: () => Promise<GitHubGet>;
    readonly now: Date;
  },
): Promise<ActiveSnapshot> {
  const { companyId, builtIn, now } = input;
  const pin = readPin(input.config);
  if (pin === undefined) {
    return { snapshot: builtIn, source: "built-in" };
  }
  const kept = await lastGood(ctx, companyId);
  const fallback: ActiveSnapshot =
    kept === undefined
      ? { snapshot: builtIn, source: "built-in" }
      : { snapshot: kept.snapshot, source: "last-good" };
  const previous = (await ctx.state.get(stateKey(companyId, "stale"))) as Stale | null;
  const since = previous?.since ?? now.toISOString();
  if (typeof pin === "string") {
    const record = {
      since,
      triedAt: now.toISOString(),
      pin: "",
      reason: `The pin is invalid: ${pin}`,
    };
    return stale(ctx, companyId, fallback, record, now);
  }
  if (
    kept !== undefined &&
    kept.sha256 === pin.sha256 &&
    kept.snapshot.workspace.commit === pin.commit
  ) {
    return { snapshot: kept.snapshot, source: "pinned" };
  }
  const triedRecently =
    previous?.pin === pinId(pin) && now.getTime() - Date.parse(previous.triedAt) < retryAfterMs;
  if (triedRecently) {
    return { ...fallback, staleReason: previous.reason };
  }
  try {
    const snapshot = await fetchPinnedSnapshot(await input.github(), pin);
    await ctx.state.set(stateKey(companyId, "last-good"), { sha256: pin.sha256, snapshot });
    await ctx.state.delete(stateKey(companyId, "stale"));
    return { snapshot, source: "pinned" };
  } catch (error) {
    const reason = (error as Error).message;
    const record = { since, triedAt: now.toISOString(), pin: pinId(pin), reason };
    return stale(ctx, companyId, fallback, record, now);
  }
}
