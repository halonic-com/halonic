import type {
  AgentRef,
  AgentRoutine,
  AgentToolList,
  AgentToolOption,
  AgentUser,
} from "@halonicjs/studio-feature-agents/api";
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

/** The workflows of the agent's hub that run it in a step, with those steps' ids; throws `not_found` when the agent isn't there. */
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
      stepIds: Object.entries(file.value.states)
        .filter(([, state]) => state.agent === id)
        .map(([stepId]) => stepId),
    }))
    .filter((user) => user.stepIds.length > 0);
}

/** The routines of the workspace that start the agent by itself, in the workspace's order. */
export function agentRoutinesOf(
  workspace: LoadedWorkspace,
  { hubId, id }: AgentRef,
): readonly AgentRoutine[] {
  return filesOf(workspace, "routine")
    .filter(
      ({ hub, value: { run } }) => "agent" in run && run.agent === id && (run.hub ?? hub) === hubId,
    )
    .map(({ hub, value }) => ({ hubId: hub, id: value.id, name: value.name ?? value.id }));
}

/**
 * How many of a connector's tools ask a person first: `all` when its `tools.approve` says so, else
 * the ones it names that agents can see (`tools.allow`, when it has one); `undefined` for none.
 */
export function asksFirstOf(tools: {
  readonly approve: readonly string[] | "all";
  readonly allow?: readonly string[] | undefined;
}): number | "all" | undefined {
  if (tools.approve === "all") return "all";
  const { allow } = tools;
  const count = tools.approve.filter((tool) => allow === undefined || allow.includes(tool)).length;
  return count === 0 ? undefined : count;
}

/**
 * The skills, knowledge and connectors the hub can use: its own, then the shared ones, only those
 * its `uses` lists when it has one (as the workspace check allows); connectors say which of their
 * tools ask first.
 */
export function toolOptionsOf(
  workspace: LoadedWorkspace,
  hubId: string,
): Readonly<Record<AgentToolList, readonly AgentToolOption[]>> {
  const uses = filesOf(workspace, "hub").find((file) => file.hub === hubId)?.value.uses;
  const optionsOf = <Kind extends "skill" | "knowledge" | "connector">(
    list: AgentToolList,
    kind: Kind,
  ) => {
    const items = filesOf(workspace, kind);
    const own = items.filter((item) => item.hub === hubId);
    const shared = items.filter(
      (item) => item.hub === null && (uses === undefined || uses[list].includes(item.value.id)),
    );
    return [...own, ...shared].map((item) => item.value);
  };
  const named = (item: { readonly id: string; readonly name?: string | undefined }) => ({
    id: item.id,
    name: item.name ?? item.id,
  });
  return {
    skills: optionsOf("skills", "skill").map(named),
    knowledge: optionsOf("knowledge", "knowledge").map(named),
    connectors: optionsOf("connectors", "connector").map((connector) => {
      const asksFirst = asksFirstOf(connector.tools);
      return { ...named(connector), ...(asksFirst !== undefined && { asksFirst }) };
    }),
  };
}
