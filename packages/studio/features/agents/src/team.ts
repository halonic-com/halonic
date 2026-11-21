/**
 * Who hands work to whom in a hub: the path work takes from one agent to another through their
 * subagents, and why adding a subagent would close a loop. The Subagents page and both hosts ask
 * the same questions, so the answers live here.
 */
import type { AgentListing } from "./api.ts";

/**
 * Why an agent can't be a subagent, from the names along its {@link handOffPath}: "Sorter already
 * hands work to Mail triage", or "… to Mail triage through Writer" when work goes through others
 * on the way (flow-agents 5.4).
 */
export function alreadyHandsWork(names: readonly string[]): string {
  const [from = "", ...rest] = names;
  const to = rest.pop() ?? from;
  const through =
    rest.length === 0
      ? ""
      : ` through ${rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(", ")} and ${rest.at(-1)}`}`;
  return `${from} already hands work to ${to}${through}`;
}

/** An agent of a hub as the Subagents page sees it: its row and the agents it hands work to. */
export interface AgentTeamMember extends AgentListing {
  /** The ids of the agents of its hub it hands work to, in its file's order. */
  readonly subagents: readonly string[];
}

/**
 * The agents work goes through from `from` until it reaches `to`, both included, following each
 * agent's subagents; `undefined` when work from `from` never reaches `to`. Adding `from` as a
 * subagent of `to` closes a loop exactly when this finds a way, so the Subagents page and the
 * host's refusal ask the same question. The shortest way is found, and an agent is `[from]`.
 */
export function handOffPath(
  team: readonly AgentTeamMember[],
  from: string,
  to: string,
): readonly string[] | undefined {
  const subagentsOf = new Map(team.map((member) => [member.id, member.subagents]));
  const cameFrom = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    if (at === to) {
      const path = [at];
      for (let step = cameFrom.get(at); typeof step === "string"; step = cameFrom.get(step)) {
        path.unshift(step);
      }
      return path;
    }
    for (const next of subagentsOf.get(at) ?? []) {
      if (!cameFrom.has(next)) {
        cameFrom.set(next, at);
        queue.push(next);
      }
    }
  }
  return undefined;
}

/**
 * Why the host refuses to give agent `to` the subagents `next` when it has `now`: the reason of the
 * first new subagent that already hands work back to `to`, as "… ; that would be a loop.", or
 * `undefined` when none does. Both hosts ask this, so the sentence lives in one place.
 */
export function loopRefusal(
  team: readonly AgentTeamMember[],
  to: string,
  now: readonly string[],
  next: readonly string[],
): string | undefined {
  for (const id of next.filter((each) => !now.includes(each))) {
    const way = handOffPath(team, id, to);
    if (way !== undefined) {
      const names = way.map((each) => team.find((member) => member.id === each)?.name ?? each);
      return `${alreadyHandsWork(names)}; that would be a loop.`;
    }
  }
  return undefined;
}
