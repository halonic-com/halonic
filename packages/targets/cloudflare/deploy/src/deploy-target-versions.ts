import type { DeployedVersion, DeploymentRef } from "@halonicjs/ports";
import type { CloudflareApi, DeployedVersion as CloudflareVersion } from "./api.ts";
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

export function version(
  ids: readonly string[],
  id: string,
  commit: string | undefined,
): DeployedVersion {
  // The Halonic version and the time it went live come with the snapshot's own record (next part).
  return {
    number: ids.indexOf(id) + 1,
    id,
    commit,
    halonicVersion: undefined,
    liveSince: undefined,
  };
}

export async function describe(
  api: CloudflareApi,
  deployment: DeploymentRef,
  ids: readonly string[],
  id: string,
): Promise<DeployedVersion> {
  const info = await api.versionInfo(deployment.accountId, deployment.service, id);
  return version(ids, id, parseVersionNote(info?.message)?.commit);
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
  const { accountId, service: worker } = deployment;
  const serving = ((await api.currentDeployment(accountId, worker)) ?? []).filter(
    (v) => v.percentage > 0,
  );
  if (serving.length === 0) return undefined;
  const { ids } = await versionNumbers(api, accountId, worker);
  return describe(api, deployment, ids, mainOf(serving));
}
