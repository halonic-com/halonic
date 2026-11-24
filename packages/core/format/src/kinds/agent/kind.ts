import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { Agent } from "./schema.ts";

/** `agents/<id>.agent.yaml`, at the root or in a hub. */
export const agentKind: FileKind<Agent> = {
  name: "agent",
  about: "An agent: its model, instructions, tools, methods and character.",
  syntax: "yaml",
  schema: Agent,
  places: [{ scope: "workspace-and-hub", folder: "agents", name: "<id>.agent.yaml" }],
  idFromPlace: "fallback",
  check: checkAsks,
};

/**
 * Halonic's own loop, as the CLI and Studio name it, for the
 * message below: never the lower-case id (HAL-15117).
 */
const halonicLoopName = "Halonic's own loop";

/**
 * `asks` only on an agent that runs a program, Claude Code, Codex or OpenCode
 * (requirement `format.agent-asks`). Halonic's own loop has no program tools
 * to ask about, so there the field would promise something that isn't true.
 * Even `always` is refused there, so nobody reads it as a promise.
 */
function checkAsks(agent: Agent): KindCheckProblem[] {
  if (agent.asks === undefined || (agent.harness !== undefined && agent.harness !== "halonic")) {
    return [];
  }
  return [
    {
      severity: "error",
      code: "asks-needs-a-program-harness",
      path: ["asks"],
      message: `asks works only for an agent with harness: claude-code, codex or opencode, and this one runs in ${halonicLoopName}. Remove asks, or set one of those harnesses.`,
    },
  ];
}
