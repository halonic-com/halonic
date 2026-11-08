import type { FileKind } from "../../kind.ts";
import { Agent } from "./schema.ts";

/** `agents/<id>.agent.yaml`, at the root or in a hub. */
export const agentKind: FileKind<Agent> = {
  name: "agent",
  about: "An agent: its model, instructions, tools, methods and character.",
  syntax: "yaml",
  schema: Agent,
  places: [{ scope: "workspace-and-hub", folder: "agents", name: "<id>.agent.yaml" }],
  idFromPlace: "fallback",
};
