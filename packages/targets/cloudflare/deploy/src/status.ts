import type { CloudflareApi } from "./api.ts";
import { databaseNameFor } from "./provision.ts";
import { parseVersionNote, startsLike } from "./version-note.ts";

const healthTimeoutMs = 10_000;

/** What the worker's `/health` route answered. */
export type Health =
  | { readonly state: "ok" }
  | { readonly state: "unhealthy"; readonly httpStatus: number }
  | { readonly state: "unreachable" }
  /** The workers.dev address is off, so there is nothing to ask. */
  | { readonly state: "no-address" };

export interface StatusVersion {
  readonly id: string;
  readonly percentage: number;
  /** The short commit the deploy noted on this version; absent when it wasn't deployed by Halonic. */
  readonly commit?: string;
  readonly bundleHash?: string;
  readonly createdAt?: number;
}

export interface DeployStatus {
  /** False when the Worker doesn't exist or has no deployment; then there is nothing else to say. */
  readonly deployed: boolean;
  readonly url?: string;
  readonly versions: readonly StatusVersion[];
  /** The commit and bundle of the version with the most traffic. */
  readonly commit?: string;
  readonly bundleHash?: string;
  /** Whether the live commit is the one in `local`; absent when `local` has none or the live one is unknown. */
  readonly commitMatches?: boolean;
  readonly bundleMatches?: boolean;
  /** Two versions share traffic, so a deploy would stop until that ends. */
  readonly splitTraffic: boolean;
  readonly health: Health;
}

export interface StatusOptions {
  readonly accountId: string;
  readonly worker: string;
  /** Your own commit and bundle hash, to compare with what is live. */
  readonly local?: { readonly commit?: string; readonly bundleHash?: string };
  /** Tests inject this. */
  readonly fetch?: typeof fetch;
}

/**
 * Says what is live: the address, which versions serve traffic and from which commit and
 * bundle, and whether `/health` answers. Reads only; it takes no lock and changes nothing.
 */
export async function status(api: CloudflareApi, options: StatusOptions): Promise<DeployStatus> {
  const { accountId, worker } = options;
  databaseNameFor(worker);
  const current = await api.currentDeployment(accountId, worker);
  const serving = (current ?? []).filter((v) => v.percentage > 0);
  if (serving.length === 0) {
    return { deployed: false, versions: [], splitTraffic: false, health: { state: "no-address" } };
  }

  const versions: StatusVersion[] = [];
  for (const { id, percentage } of serving) {
    const info = await api.versionInfo(accountId, worker, id);
    const note = parseVersionNote(info?.message);
    versions.push({
      id,
      percentage,
      ...(note ?? {}),
      ...(info?.createdAt === undefined ? {} : { createdAt: info.createdAt }),
    });
  }
  const main = versions.reduce((a, b) => (b.percentage > a.percentage ? b : a));
  const url = await api.workersDevUrl(accountId, worker);

  const { local } = options;
  return {
    deployed: true,
    ...(url ? { url } : {}),
    versions,
    ...(main.commit ? { commit: main.commit } : {}),
    ...(main.bundleHash ? { bundleHash: main.bundleHash } : {}),
    ...(local?.commit && main.commit
      ? { commitMatches: startsLike(local.commit, main.commit) }
      : {}),
    ...(local?.bundleHash && main.bundleHash
      ? { bundleMatches: startsLike(local.bundleHash, main.bundleHash) }
      : {}),
    splitTraffic: versions.length > 1,
    health: url ? await checkHealth(url, options.fetch ?? fetch) : { state: "no-address" },
  };
}

/** Asks `GET /health`; any failure to answer is "unreachable", never an exception. */
export async function checkHealth(url: string, doFetch: typeof fetch): Promise<Health> {
  try {
    const response = await doFetch(`${url}/health`, {
      signal: AbortSignal.timeout(healthTimeoutMs),
    });
    if (!response.ok) return { state: "unhealthy", httpStatus: response.status };
    const body = (await response.json()) as { status?: unknown };
    return body.status === "ok"
      ? { state: "ok" }
      : { state: "unhealthy", httpStatus: response.status };
  } catch {
    return { state: "unreachable" };
  }
}
