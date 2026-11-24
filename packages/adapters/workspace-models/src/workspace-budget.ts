// The budget an engine's runs keep to: the `budget` of the workspace's
// `workspace.yaml` (`engine.budget-stops`, HAL-11380). The CLI's
// `openLocalEngine` and the Studio's `EngineService` both pass it as their
// runs' `budget`, so a budget a person sets in either one stops runs in both.

import type { WorkspaceSettings } from "@halonicjs/format";
import { filesOf, hasBudget, type LoadedWorkspace } from "@halonicjs/workspace";

/** A workspace's budget with a run, run token or monthly limit, as the engine's runs read it. */
export type WorkspaceBudget = NonNullable<WorkspaceSettings["budget"]>;

/**
 * The runs' `budget`: the `budget` of `latest()`'s `workspace.yaml`, read
 * before every paid call, or `undefined` when it sets none of `perRun`,
 * `perRunTokens` and `monthly` (a block with only a currency limits nothing)
 * or the workspace has no `workspace.yaml` that parsed. `hasBudget` stays
 * about money, since the Studio's Budget block edits only the two amounts;
 * the token limit is checked here so the engine still keeps to it.
 *
 * @example
 * const runs = { store, blobs, ids, definitionsOf, budget: workspaceBudget(() => workspace) };
 */
export function workspaceBudget(
  latest: () => LoadedWorkspace,
): () => Promise<WorkspaceBudget | undefined> {
  return async () => {
    const budget = filesOf(latest(), "workspace")[0]?.value.budget;
    if (budget === undefined) return undefined;
    return hasBudget(budget) || budget.perRunTokens !== undefined ? budget : undefined;
  };
}
