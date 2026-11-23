import type { WorkspaceIssue } from "../load-workspace.ts";
import {
  addKeyFix,
  manyUsersSubscriptionCode,
  manyUsersSubscriptionMessage,
  signInAgents,
} from "../many-users-subscription.ts";
import type { CheckContext } from "./check-context.ts";

/**
 * Each deployment with `users.mode: many` refuses every harness agent with no
 * provider key, at the agent's `harness`: other people would run it on the
 * owner's own sign-in (requirement `workspace.many-users-subscription`).
 */
export function checkManyUsersSubscription(context: CheckContext): WorkspaceIssue[] {
  const deployments = context.filesOf("deployments")[0]?.value.deployments ?? {};
  const many = Object.entries(deployments)
    .filter(([, deployment]) => deployment.users?.mode === "many")
    .map(([id]) => id);
  if (many.length === 0) return [];
  return signInAgents(context.files).flatMap((agent) =>
    many.map((deployment) => {
      const message = `${manyUsersSubscriptionMessage(deployment, agent)} ${addKeyFix(agent.providerType)}`;
      return context.error(agent.file, ["harness"], manyUsersSubscriptionCode, message);
    }),
  );
}
