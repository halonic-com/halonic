import type { PluginAgentsClient } from "@paperclipai/plugin-sdk";
import { threadTitle } from "./chief-line-settings.ts";

/**
 * Which line a call or comment is about: a caller and the agent it talks to.
 * No agent means Chief, whose threads keep the old `[chief-line] <caller>`
 * title and are stored under the caller alone, so threads made before lines
 * to other agents keep working (src/plugin/chief-line.ts).
 */
export interface LineTarget {
  readonly caller: string;
  /** The agent on the line; undefined for Chief. */
  readonly agent?: { readonly id: string; readonly name: string };
}

interface AgentRef {
  readonly id: string;
  readonly name: string;
  readonly urlKey?: string | null;
}

/** Whether an agent is Chief: named Chief, or with url key `chief`. */
export const isChief = (agent: AgentRef) =>
  agent.urlKey === "chief" || agent.name.toLowerCase() === "chief";

/** The agent with this id, url key or name (case does not matter), if any. */
export function findAgent<T extends AgentRef>(agents: readonly T[], ref: string): T | undefined {
  const lower = ref.trim().toLowerCase();
  return (
    agents.find((agent) => agent.id === ref) ??
    agents.find((agent) => agent.urlKey === lower) ??
    agents.find((agent) => agent.name.toLowerCase() === lower)
  );
}

/** The line's thread title. */
export const targetTitle = (target: LineTarget) => threadTitle(target.caller, target.agent?.name);

/** Where the line's thread and webhook are stored: the caller for Chief, else caller and agent id. */
export const targetKey = (target: LineTarget) =>
  target.agent === undefined ? target.caller : `${target.caller} → ${target.agent.id}`;

/** The agent's display name on the line: `Chief` for Chief. */
export const targetAgentName = (target: LineTarget) => target.agent?.name ?? "Chief";

/**
 * The line for a caller and an optional agent (id, url key or name). No agent, or Chief, is the
 * chief line. Answers an error message when the agent is not a string or not found.
 */
export async function resolveTarget(
  ctx: { readonly agents: Pick<PluginAgentsClient, "list"> },
  companyId: string,
  caller: string,
  agent: unknown,
): Promise<LineTarget | string> {
  if (agent === undefined || agent === null || agent === "") {
    return { caller };
  }
  if (typeof agent !== "string") {
    return "agent must be an agent's name or id.";
  }
  const found = findAgent(await ctx.agents.list({ companyId, limit: 500 }), agent);
  if (found === undefined) {
    return `No agent ${agent} in this company.`;
  }
  return isChief(found) ? { caller } : { caller, agent: { id: found.id, name: found.name } };
}
