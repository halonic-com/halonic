import type { ItemUsage } from "@halonicjs/app";

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The right side of a Library row. One agent is named, as "Used by Support"; anything else is
 * counted, as "Used by 2 agents" or "Used by 1 agent and 1 collection", and three parts as "Used by 1 agent, 1 routine and 1 collection". Hubs that take a shared
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
  const last = parts.at(-1);
  if (last === undefined) return "Not used yet";
  return `Used by ${parts.length === 1 ? last : `${parts.slice(0, -1).join(", ")} and ${last}`}`;
}

/**
 * The second line of "Moved X to the trash": who still uses the item, or `undefined` when nobody
 * does. Unlike a row's text it names the hubs that take a shared item (flow-library 3.1, 4).
 *
 * @example
 * usedByLine({ agents: [{ id: "support", name: "Support", hub: null }], hubs: [], routines: [], collections: [] });
 * // "Used by Support"
 */
export function usedByLine(usage: ItemUsage): string | undefined {
  if (usage.hubs.length === 0) {
    return usedByText(usage) === "Not used yet" ? undefined : usedByText(usage);
  }
  const [onlyHub] = usage.hubs;
  const others = usage.agents.length + usage.routines.length + usage.collections.length;
  if (onlyHub !== undefined && usage.hubs.length === 1 && others === 0) {
    return `Used by the ${onlyHub.name} hub`;
  }
  const rest = usedByText({ ...usage, hubs: [] });
  const hubs = counted(usage.hubs.length, "hub");
  return others === 0 ? `Used by ${hubs}` : `${rest} and ${hubs}`;
}
