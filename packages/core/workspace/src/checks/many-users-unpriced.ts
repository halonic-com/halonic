import type { WorkspaceIssue } from "../load-workspace.ts";
import {
  manyUsersUnpricedMessage,
  manyUsersUnpricedModelCode,
  stopsAtCostWithManyUsers,
  unpricedAgents,
} from "../many-users-unpriced.ts";
import type { CheckContext } from "./check-context.ts";

/**
 * Each deployment with `users.mode: many` and a `cost` limit of `meter:
 * config` refuses every agent that could call a model without a price, at
 * the key that chose its model: its calls would count no cost, so the limit
 * would never stop them (requirement `workspace.many-users-unpriced-model`).
 */
export function checkManyUsersUnpriced(context: CheckContext): WorkspaceIssue[] {
  const deployments = context.filesOf("deployments")[0]?.value.deployments ?? {};
  const limited = Object.entries(deployments)
    .filter(([, deployment]) => stopsAtCostWithManyUsers(deployment))
    .map(([id]) => id);
  if (limited.length === 0) return [];
  return unpricedAgents(context.files).flatMap((agent) =>
    limited.map((deployment) =>
      context.error(
        agent.file,
        [...agent.at],
        manyUsersUnpricedModelCode,
        manyUsersUnpricedMessage(deployment, agent),
      ),
    ),
  );
}
