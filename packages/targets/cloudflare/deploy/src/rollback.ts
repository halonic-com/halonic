import type { CloudflareApi, DeployedVersion } from "./api.ts";
import { DeployError } from "./errors.ts";
import { withDeployLock } from "./lock.ts";
import { databaseNameFor } from "./provision.ts";
import { checkHealth, type Health } from "./status.ts";

export interface RollbackOptions {
  readonly accountId: string;
  readonly worker: string;
  /** What a deploy that meets the lock is shown as the holder. */
  readonly label: string;
  /** Says what would happen and changes nothing: no lock, no write. */
  readonly plan?: boolean;
  readonly signal?: AbortSignal;
  /** Tests inject these. */
  readonly fetch?: typeof fetch;
  readonly lock?: Pick<
    NonNullable<Parameters<typeof withDeployLock>[1]>,
    "id" | "now" | "schedule"
  >;
}

export interface RollbackResult {
  readonly mode: "plan" | "rolled-back";
  /** The versions that served before. */
  readonly from: readonly DeployedVersion[];
  /** The versions that serve now (or would, in `plan`). */
  readonly to: readonly DeployedVersion[];
  /** Asked after the switch; absent in `plan`. A bad answer does not undo the rollback. */
  readonly health?: Health;
}

const ids = (versions: readonly DeployedVersion[]) =>
  versions
    .map((v) => v.id)
    .sort()
    .join(",");

/**
 * Switches traffic back to the version that served before the current one. A version that only
 * ever had 0% (a failed deploy's) is skipped. Database migrations are not undone: they only go
 * forward. Run twice, it switches forward again.
 *
 * @throws DeployError `not-deployed` when the Worker or its database isn't there
 * @throws DeployError `nothing-to-roll-back` when no earlier version served traffic
 */
export async function rollback(
  api: CloudflareApi,
  options: RollbackOptions,
): Promise<RollbackResult> {
  const { accountId, worker } = options;
  const database = databaseNameFor(worker);

  const choose = async () => {
    const history = await api.deploymentHistory(accountId, worker);
    const [latest, ...earlier] = history;
    const from = (latest ?? []).filter((v) => v.percentage > 0);
    if (from.length === 0) {
      throw new DeployError(
        "not-deployed",
        `${worker} has no live version, so there is nothing to roll back.`,
      );
    }
    const target = earlier
      .map((d) => d.filter((v) => v.percentage > 0))
      .find((d) => d.length > 0 && ids(d) !== ids(from));
    if (!target) {
      throw new DeployError(
        "nothing-to-roll-back",
        `${worker} has no earlier version that served traffic, so there is nothing to switch back to.`,
      );
    }
    return {
      from,
      to: target.length === 1 ? [{ id: target[0]?.id ?? "", percentage: 100 }] : target,
    };
  };

  if (!(await api.findResource(accountId, { kind: "database", name: database }))) {
    throw new DeployError("not-deployed", `${worker} was never deployed to this account.`);
  }
  if (options.plan) return { mode: "plan", ...(await choose()) };

  const done = await withDeployLock(
    api,
    {
      accountId,
      worker,
      label: options.label,
      ...(options.signal ? { signal: options.signal } : {}),
      ...options.lock,
    },
    async (lock) => {
      // Chosen under the lock, so a deploy that just finished is the one rolled back.
      const choice = await choose();
      await lock.renew();
      if (options.signal?.aborted)
        throw new DeployError("deploy-aborted", "The rollback was interrupted.");
      await api.deployVersions(accountId, worker, choice.to);
      return choice;
    },
  );
  const url = await api.workersDevUrl(accountId, worker);
  const health = url
    ? await checkHealth(url, options.fetch ?? fetch)
    : ({ state: "no-address" } as const);
  return { mode: "rolled-back", ...done, health };
}
