import type { DeployReach } from "@halonicjs/ports";
import type { CloudflareApi } from "./api.ts";
import { definitionsBucketFor } from "./provision.ts";

/**
 * What a deploy keeps about each version it uploaded (requirement
 * `deploy.record`): the commit, the Halonic version and what it reaches. The
 * version note can't hold them, because Cloudflare keeps only 100 characters
 * of it, so they go to the definitions bucket, one object per version.
 */
export interface DeployRecord {
  readonly commit: string;
  readonly halonicVersion: string;
  readonly reaches: readonly DeployReach[];
}

/** Where a version's record lives in the definitions bucket, beside the snapshots. */
export function deployRecordKey(versionId: string): string {
  return `deploys/${versionId}.json`;
}

/** Writes the record of the version a deploy uploaded. */
export async function writeDeployRecord(
  api: CloudflareApi,
  accountId: string,
  worker: string,
  versionId: string,
  record: DeployRecord,
): Promise<void> {
  const { commit, halonicVersion, reaches } = record;
  const body = JSON.stringify({
    commit,
    halonicVersion,
    reaches: reaches.map(({ address, secret }) => ({ address, secret: secret ?? null })),
  });
  await api.putObject(accountId, definitionsBucketFor(worker), deployRecordKey(versionId), body);
}

/**
 * The record of a version, or `undefined` when it has none or it isn't one:
 * a version from before records, or one whose record couldn't be written.
 * Callers treat that as knowing nothing, which counts everything as new.
 */
export async function readDeployRecord(
  api: CloudflareApi,
  accountId: string,
  worker: string,
  versionId: string,
): Promise<DeployRecord | undefined> {
  const text = await api.getObject(
    accountId,
    definitionsBucketFor(worker),
    deployRecordKey(versionId),
  );
  return text === undefined ? undefined : parseDeployRecord(text);
}

/** A record's text as a record, or `undefined` when it doesn't fit the shape. */
export function parseDeployRecord(text: string): DeployRecord | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { commit, halonicVersion, reaches } = parsed as Record<string, unknown>;
  if (typeof commit !== "string" || typeof halonicVersion !== "string") return undefined;
  if (!Array.isArray(reaches)) return undefined;
  const read = (reaches as unknown[]).map(reachOf);
  if (read.some((reach) => reach === undefined)) return undefined;
  return { commit, halonicVersion, reaches: read as DeployReach[] };
}

/** One reach of a record, or `undefined` when it doesn't fit. */
function reachOf(reach: unknown): DeployReach | undefined {
  if (typeof reach !== "object" || reach === null) return undefined;
  const { address, secret } = reach as Record<string, unknown>;
  if (typeof address !== "string") return undefined;
  if (secret !== null && typeof secret !== "string") return undefined;
  return { address, secret: secret ?? undefined };
}
