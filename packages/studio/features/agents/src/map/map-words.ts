/** Joins a workflow card's steps: "triage, draft and check". */
const stepList = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** The agent map's words (flow-agents 6, microcopy 8.4 and 19.7). */
export const mapWords = {
  tab: "Flow",
  /** The map's accessible name. */
  map: (name: string) => `How ${name} fits in`,
  workIn: "What brings it work",
  canUse: "What it can use",
  workOut: "Who it hands work to",
  agentSteps: "Agent steps",
  workflow: "Workflow",
  agent: "Agent",
  kinds: { skills: "Skill", knowledge: "Knowledge", connectors: "Connector" },
  /** A workflow card's detail line: the steps that call the agent, "triage, draft". */
  steps: (stepIds: readonly string[]) => stepIds.join(", "),
  /** A workflow card's name: "Workflow Support reply, uses Sorter in triage and draft" (mc 19.7). */
  workflowCard: (workflow: string, agent: string, stepIds: readonly string[]) =>
    `Workflow ${workflow}, uses ${agent} in ${stepList.format(stepIds)}`,
  /** A summary card's counts, the kinds with none left out: "2 workflows · 1 agent". */
  summary: {
    in: (workflows: number, agents: number) =>
      counts([workflows, "workflow", "workflows"], [agents, "agent", "agents"]),
    use: (skills: number, knowledge: number, connectors: number) =>
      counts(
        [skills, "skill", "skills"],
        [knowledge, "knowledge", "knowledge"],
        [connectors, "connector", "connectors"],
      ),
    out: (subagents: number) => counts([subagents, "subagent", "subagents"]),
  },
  addTrigger: "Add trigger",
  addTool: "Add a tool",
  addSubagent: "Add subagent",
  loadFailed: (name: string) => `Couldn't show ${name}'s map`,
  tryAgain: "Try again",
} as const;

/** "2 workflows · 1 agent": each count with its word, leaving out the ones at nought. */
function counts(...parts: readonly (readonly [number, string, string])[]): string {
  return parts
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
    .join(" · ");
}
