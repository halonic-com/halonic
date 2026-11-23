/**
 * Part (c) of the board check: the team's load, for Chief. It names the
 * agents with nothing they can start (no `todo` and no unblocked
 * `in_progress` task) and the agents with more than 10 tasks in progress.
 * Pip is left out, as are agents that are paused, waiting for approval or
 * gone, since none of them takes work.
 */

/** More than this many tasks in progress counts as too many. */
export const inProgressLimit = 10;
/** The agent the addendum leaves out of the team load. */
export const leftOut = "pip";

const notWorking = new Set(["paused", "pending_approval", "terminated"]);

/** The agent fields the team load reads. */
export interface LoadAgent {
  readonly id: string;
  readonly urlKey: string;
  readonly status: string;
}

/** The task fields the team load reads. */
export interface LoadTask {
  readonly status: string;
  readonly assigneeAgentId: string | null;
  readonly blockerAttention?: { readonly unresolvedBlockerCount: number } | null;
}

/** The team's load: who has nothing to start, and who has too much in progress. */
export interface TeamLoad {
  /** Agent ids with nothing to start, sorted. */
  readonly idle: readonly string[];
  /** Agents with more than 10 tasks in progress, most first. */
  readonly overloaded: readonly { readonly agentId: string; readonly inProgress: number }[];
}

function startable(task: LoadTask): boolean {
  if (task.status === "todo") {
    return true;
  }
  return (
    task.status === "in_progress" && (task.blockerAttention?.unresolvedBlockerCount ?? 0) === 0
  );
}

/** Works out the team's load from the pass's listing of open tasks. */
export function teamLoad(tasks: readonly LoadTask[], agents: readonly LoadAgent[]): TeamLoad {
  const working = agents.filter(
    (agent) => agent.urlKey !== leftOut && !notWorking.has(agent.status),
  );
  const idle = working
    .filter((agent) => !tasks.some((task) => task.assigneeAgentId === agent.id && startable(task)))
    .map((agent) => agent.id)
    .sort();
  const overloaded = working
    .map((agent) => ({
      agentId: agent.id,
      inProgress: tasks.filter(
        (task) => task.assigneeAgentId === agent.id && task.status === "in_progress",
      ).length,
    }))
    .filter((agent) => agent.inProgress > inProgressLimit)
    .sort((a, b) => b.inProgress - a.inProgress || a.agentId.localeCompare(b.agentId));
  return { idle, overloaded };
}

/** Whether two loads name the same agents in the same way. */
export function sameLoad(a: TeamLoad, b: TeamLoad): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The two lines Chief reads, in the document and in the comment. */
export function loadLines(load: TeamLoad, names: ReadonlyMap<string, string>): string[] {
  const name = (agentId: string) => names.get(agentId) ?? agentId;
  const idle = load.idle.map(name).join(", ");
  const overloaded = load.overloaded
    .map((agent) => `${name(agent.agentId)} (${agent.inProgress})`)
    .join(", ");
  return [
    `- Nothing to start (no todo, no unblocked in progress): ${idle === "" ? "nobody" : idle}.`,
    `- More than ${inProgressLimit} tasks in progress: ${overloaded === "" ? "nobody" : overloaded}.`,
  ];
}

/** The document's section "For Chief". */
export function loadSection(load: TeamLoad, names: ReadonlyMap<string, string>): string {
  return ["## For Chief", "", "Team load, Pip left out.", "", ...loadLines(load, names)].join("\n");
}

/** Reads a saved load back; anything odd counts as none saved. */
export function readLoad(value: unknown): TeamLoad | undefined {
  const load = value as Partial<TeamLoad> | null | undefined;
  return Array.isArray(load?.idle) && Array.isArray(load?.overloaded)
    ? { idle: load.idle, overloaded: load.overloaded }
    : undefined;
}
