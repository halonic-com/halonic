import type { HarnessAgent } from "@halonicjs/engine";
import type { Agent } from "@halonicjs/format";

/** The `writer` agent's file, with the format's defaults filled in, running in Claude Code. */
export function writerFile(fields: Partial<Agent> = {}): Agent {
  return {
    version: 1,
    id: "writer",
    name: "Writer",
    params: {},
    instructions: "",
    skills: [],
    knowledge: [],
    connectors: [],
    runLogs: false,
    collections: [],
    subagents: [],
    methods: {},
    output: { type: "text" },
    maxSteps: 6,
    harness: "claude-code",
    ...fields,
  };
}

/** The `writer` agent of `run_1`, as the engine asks the host about it. */
export function writerAgent(filesFolder: string | null, file: Agent = writerFile()): HarnessAgent {
  return {
    runId: "run_1",
    hubId: "main",
    agentId: "writer",
    harness: "claude-code",
    file,
    filesFolder,
  };
}
