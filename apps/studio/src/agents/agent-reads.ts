import type { AgentRef, AgentUser } from "@halonicjs/studio-feature-agents/api";
import { filesOf, type LoadedWorkspace, resolveModel } from "@halonicjs/workspace";
import { agentGone } from "./agent-file.ts";

/**
 * The hub's default model, else the workspace's; `undefined` when neither names one, or the one
 * named is neither an alias nor a `provider/model` name.
 */
export function defaultModelOf(workspace: LoadedWorkspace, hubId: string): string | undefined {
  const hub = filesOf(workspace, "hub").find((file) => file.hub === hubId)?.value;
  const settings = filesOf(workspace, "workspace")[0]?.value;
  const name = hub?.defaults.model ?? settings?.defaults.model;
  return name !== undefined && resolveModel(workspace, hubId, name) !== undefined
    ? name
    : undefined;
}

/** The workflows of the agent's hub that run it in a step, with how many steps; throws `not_found` when the agent isn't there. */
export function agentUsersOf(
  workspace: LoadedWorkspace,
  { hubId, id }: AgentRef,
): readonly AgentUser[] {
  if (!filesOf(workspace, "agent").some((one) => one.hub === hubId && one.value.id === id)) {
    throw agentGone();
  }
  return filesOf(workspace, "workflow")
    .filter((file) => file.hub === hubId)
    .map((file) => ({
      hubId,
      id: file.value.id,
      name: file.value.name,
      steps: Object.values(file.value.states).filter((state) => state.agent === id).length,
    }))
    .filter((user) => user.steps > 0);
}
