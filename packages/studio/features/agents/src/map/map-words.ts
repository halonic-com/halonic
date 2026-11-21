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
  steps: (count: number) => (count === 1 ? "1 step" : `${count} steps`),
  /** A workflow card's name, until the card names its steps (mc 19.7). */
  workflowCard: (workflow: string, agent: string, steps: number) =>
    `Workflow ${workflow}, uses ${agent} in ${steps === 1 ? "1 step" : `${steps} steps`}`,
  addTrigger: "Add trigger",
  addTool: "Add a tool",
  addSubagent: "Add subagent",
  loadFailed: (name: string) => `Couldn't show ${name}'s map`,
  tryAgain: "Try again",
} as const;
