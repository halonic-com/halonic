import { asksBeforeEachUse, type Connector } from "@halonicjs/format";
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
 * How many of a connector's tools can run without asking a person first, by the engine's rule
 * ({@link asksBeforeEachUse}, HAL-12545): the ones its `tools.read` names that `tools.approve`
 * doesn't, among those agents can see (`tools.allow`, when it has one). Every other tool asks first.
 * It's at most that many: the map has no listing, and a tool whose listing says `send` asks first
 * anyway, so the card stays on the safe side.
 */
export function toolsWithoutAskingOf(
  tools: Pick<Connector["tools"], "approve" | "read" | "allow">,
): number {
  const { allow } = tools;
  return [...new Set(tools.read)].filter(
    (tool) => (allow === undefined || allow.includes(tool)) && !asksBeforeEachUse(tools, tool),
  ).length;
}

/**
 * The skills, knowledge and connectors the hub can use: its own, then the shared ones, only those
 * its `uses` lists when it has one (as the workspace check allows); connectors say how many of
 * their tools can run without asking first.
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
    connectors: optionsOf("connectors", "connector").map((connector) => ({
      ...named(connector),
      toolsWithoutAsking: toolsWithoutAskingOf(connector.tools),
    })),
  };
}
