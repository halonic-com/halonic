// The part of the trust content that harness agents add (stack 3c of the
// HAL-189 plan): the program each one starts, the sites it may reach and,
// when it isn't the default, the folder it writes to. They decide what a
// program on the person's computer can touch, so a change asks for trust
// again (plan 11).

import { type Agent, asciiAllowedSites, defaultWorkingFolder } from "@halonicjs/format";
import { posixPath } from "@halonicjs/std";

/** One harness agent's part of the trust content. */
export interface AgentTrustContent {
  id: string;
  /** The harness the agent starts, such as `claude-code`. Never `halonic`. */
  harness: string;
  /** The sites the agent may reach, in their stored form (lowercase, Punycode), sorted. */
  allowedSites: string[];
  /** The folder the agent writes to, normalised. Only there when it isn't `files/agents/<id>`. */
  workingFolder?: string;
}

/**
 * The trust content of the agents that run in a harness other than
 * Halonic's own loop, sorted by id. An agent without `harness`, or with
 * `halonic`, starts no program, so it isn't listed.
 *
 * @example
 * agentsTrustContent([{ ...coder, harness: "claude-code", allowedSites: ["API.example.com"] }]);
 * // [{ id: "coder", harness: "claude-code", allowedSites: ["api.example.com"] }]
 */
export function agentsTrustContent(agents: readonly Agent[]): AgentTrustContent[] {
  return agents
    .filter((agent) => agent.harness !== undefined && agent.harness !== "halonic")
    .map(agentContent)
    .sort((left, right) => compareText(left.id, right.id));
}

function agentContent(agent: Agent): AgentTrustContent {
  const workingFolder = folderPath(agent.workingFolder ?? defaultWorkingFolder(agent.id));
  const isDefault = workingFolder === folderPath(defaultWorkingFolder(agent.id));
  return {
    id: agent.id,
    harness: agent.harness ?? "halonic",
    allowedSites: asciiAllowedSites(agent.allowedSites ?? []).sort(compareText),
    ...(isDefault ? {} : { workingFolder }),
  };
}

/**
 * A folder path normalised, without a trailing `/`, so `files/agents/coder/`
 * and `./files/agents/coder` are the same folder.
 */
function folderPath(path: string): string {
  const normalized = posixPath.normalize(path);
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

/** Compares by code unit, so the order is the same on every machine and locale. */
function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
