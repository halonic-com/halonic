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
 * The second line of "Deleted X.": what breaks, or `undefined` when no agent uses the
 * item. Only agents have a sentence in the design (flow-library 4, microcopy 11.3); the other
 * users of an item (collections, connectors' routines, hubs) have none until Maya settles it.
 *
 * @example
 * usedByLine({ agents: [{ id: "support", name: "Support", hub: null }], hubs: [], routines: [], collections: [] });
 * // "1 agent now shows an error until you take it off its Tools page."
 */
export function usedByLine(usage: ItemUsage): string | undefined {
  const count = usage.agents.length;
  if (count === 0) return undefined;
  return count === 1
    ? "1 agent now shows an error until you take it off its Tools page."
    : `${count} agents now show an error until you take it off their Tools page.`;
}
