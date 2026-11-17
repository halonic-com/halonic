// The budget an engine's runs keep to: the `budget` of the workspace's
// `workspace.yaml` (`engine.budget-stops`, HAL-11380). The CLI's
// `openLocalEngine` and the Studio's `EngineService` both pass it as their
// runs' `budget`, so a budget a person sets in either one stops runs in both.

import type { WorkspaceSettings } from "@halonicjs/format";
import { filesOf, hasBudget, type LoadedWorkspace } from "@halonicjs/workspace";

/** A workspace's budget with a run or monthly limit, as the engine's runs read it. */
export type WorkspaceBudget = NonNullable<WorkspaceSettings["budget"]>;

/**
 * The runs' `budget`: the `budget` of `latest()`'s `workspace.yaml`, read
 * before every paid call, or `undefined` when it sets neither `perRun` nor
 * `monthly` (a block with only a currency limits nothing) or the workspace
 * has no `workspace.yaml` that parsed.
 *
 * @example
 * const runs = { store, blobs, ids, definitionsOf, budget: workspaceBudget(() => workspace) };
 */
export function workspaceBudget(
  latest: () => LoadedWorkspace,
): () => Promise<WorkspaceBudget | undefined> {
  return async () => {
    const budget = filesOf(latest(), "workspace")[0]?.value.budget;
    return budget !== undefined && hasBudget(budget) ? budget : undefined;
  };
}
