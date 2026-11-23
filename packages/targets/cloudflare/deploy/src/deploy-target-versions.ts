import type { DeployedVersion, DeploymentRef, DeployReach } from "@halonicjs/ports";
import type { CloudflareApi, DeployedVersion as CloudflareVersion } from "./api.ts";
import { type DeployRecord, readDeployRecord } from "./deploy-record.ts";
import { portFailure } from "./port-failure.ts";
import { parseVersionNote } from "./version-note.ts";

/**
 * Every version that ever served, oldest first, so a version's number is its
 * place here counting from 1. A deployment Cloudflare made for a secret
 * change runs the version before it, so it adds no number.
 */
export async function versionNumbers(
  api: CloudflareApi,
  accountId: string,
  worker: string,
): Promise<{ readonly ids: readonly string[] }> {
  const ids: string[] = [];
  for (const deployment of [...(await api.deploymentHistory(accountId, worker))].reverse()) {
    if (deployment.some((v) => v.secretChange === true)) continue;
    for (const v of deployment) if (v.percentage > 0 && !ids.includes(v.id)) ids.push(v.id);
  }
  return { ids };
}

/**
 * A version as the port names it. Its record, when it has one, gives the full
 * commit and the Halonic version; without one the commit comes from the
 * version note, which keeps a short commit, and the Halonic version is unknown.
 */
export function version(
  ids: readonly string[],
  id: string,
  commit: string | undefined,
  record?: DeployRecord,
): DeployedVersion {
  return {
    number: ids.indexOf(id) + 1,
    id,
    commit: record?.commit ?? commit,
    halonicVersion: record?.halonicVersion,
    liveSince: undefined,
  };
}

/** The record of a version, from the deployment's definitions bucket. */
export function recordOf(
  api: CloudflareApi,
  deployment: DeploymentRef,
  id: string,
): Promise<DeployRecord | undefined> {
  return readDeployRecord(api, deployment.accountId, deployment.service, id);
}

export async function describe(
  api: CloudflareApi,
  deployment: DeploymentRef,
  ids: readonly string[],
  id: string,
): Promise<DeployedVersion> {
  const [info, record] = await Promise.all([
    api.versionInfo(deployment.accountId, deployment.service, id),
    recordOf(api, deployment, id),
  ]);
  return version(ids, id, parseVersionNote(info?.message)?.commit, record);
}

/** The version that gets the most traffic. */
export function mainOf(versions: readonly CloudflareVersion[]): string {
  const [first, ...rest] = versions;
  if (first === undefined)
    throw portFailure("not-deployed", "not_found", "Nothing serves on Cloudflare.");
  return rest.reduce((a, b) => (b.percentage > a.percentage ? b : a), first).id;
}

/** The version that serves now, numbered as `status` numbers it; `undefined` when nothing serves. */
export async function liveVersion(
  api: CloudflareApi,
  deployment: DeploymentRef,
): Promise<DeployedVersion | undefined> {
  return (await liveWithReaches(api, deployment))?.version;
}

/**
 * The version that serves now and what it reaches, from its record;
 * `reaches` is `undefined` when it has no record.
 */
export async function liveWithReaches(
  api: CloudflareApi,
  deployment: DeploymentRef,
): Promise<
  | { readonly version: DeployedVersion; readonly reaches: readonly DeployReach[] | undefined }
  | undefined
> {
  const { accountId, service: worker } = deployment;
  const serving = ((await api.currentDeployment(accountId, worker)) ?? []).filter(
    (v) => v.percentage > 0,
  );
  if (serving.length === 0) return undefined;
  const id = mainOf(serving);
  const [{ ids }, info, record] = await Promise.all([
    versionNumbers(api, accountId, worker),
    api.versionInfo(accountId, worker, id),
    recordOf(api, deployment, id),
  ]);
  return {
    version: version(ids, id, parseVersionNote(info?.message)?.commit, record),
    reaches: record?.reaches,
  };
}
