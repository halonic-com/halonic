import type { ItemUsage } from "@halonicjs/app";

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The right side of a Library row. One agent is named, as "Used by Support"; anything else is
 * counted, as "Used by 2 agents" or "Used by 1 agent and 1 collection". Hubs that take a shared
 * item aren't counted: only the delete line names them (flow-library 3.1).
 *
 * @example
 * usedByText({ agents: [{ id: "support", name: "Support", hub: null }], hubs: [], routines: [], collections: [] });
 * // "Used by Support"
 */
export function usedByText(usage: ItemUsage): string {
  const [onlyAgent] = usage.agents;
  const onlyAnAgent = usage.routines.length === 0 && usage.collections.length === 0;
  if (onlyAgent !== undefined && usage.agents.length === 1 && onlyAnAgent) {
    return `Used by ${onlyAgent.name}`;
  }
  const parts = [
    usage.agents.length > 0 ? counted(usage.agents.length, "agent") : undefined,
    usage.routines.length > 0 ? counted(usage.routines.length, "routine") : undefined,
    usage.collections.length > 0 ? counted(usage.collections.length, "collection") : undefined,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? "Not used yet" : `Used by ${parts.join(" and ")}`;
}
