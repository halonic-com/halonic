import { KindedError } from "@halonicjs/std";
import type {
  AgentChange,
  AgentListing,
  AgentOutput,
  TrashedAgent,
} from "@halonicjs/studio-feature-agents/api";
import { deleteWithUndo, type UndoableDeleteFiles } from "../files/undoable-delete.ts";
import { paramsProblem } from "./agent-params.ts";

/** The `output` as the file writes it: a JSON reply without a schema has no `schema` key. */
export function outputValue(output: AgentOutput): AgentOutput {
  return output.type === "json" && output.schema === undefined ? { type: "json" } : output;
}

/** Why a change can't be written, as the agent file's schema would refuse it; `undefined` when it can. */
export function changeProblem(change: AgentChange): string | undefined {
  if (change.name !== undefined && change.name.trim() === "") return "An agent needs a name.";
  const { maxSteps } = change;
  if (maxSteps !== undefined && !(Number.isInteger(maxSteps) && maxSteps >= 1 && maxSteps <= 200)) {
    return "The turn limit is a whole number from 1 to 200.";
  }
  if (change.output?.type === "choice" && change.output.options.length === 0) {
    return "A list of options needs at least one.";
  }
  return change.params === undefined ? undefined : paramsProblem(change.params);
}

/** What a row of the list shows of an agent's file. */
export function listingOf(
  hubId: string,
  agent: { id: string; name: string; description?: string | undefined; model?: string | undefined },
): AgentListing {
  return {
    hubId,
    id: agent.id,
    name: agent.name,
    description: agent.description,
    model: agent.model,
  };
}

/** What a read of an agent the workspace doesn't have rejects with: Studio shows the item-gone state for it. */
export function agentGone(): KindedError {
  return new KindedError("not_found", "This agent isn't in this workspace any more.");
}

export const agentSuffix = ".agent.yaml";

/** The text of a new agent: its id, its name and, when the person wrote any, its instructions. */
export function newAgentText(id: string, name: string, instructions: string): string {
  return [
    `id: ${id}`,
    // A JSON string is a YAML double-quoted one, so any text a person types is safe.
    `name: ${JSON.stringify(name)}`,
    ...(instructions === "" ? [] : [`instructions: ${JSON.stringify(instructions)}`]),
    "",
  ].join("\n");
}

/**
 * Moves the agent's file to the trash as one change, with the way back of {@link deleteWithUndo}:
 * it puts the agent back after later changes too, unless a file has taken its place.
 */
export async function trashAgentFile(
  files: UndoableDeleteFiles,
  path: string,
  name: string,
): Promise<TrashedAgent> {
  return deleteWithUndo(files, { paths: [path], what: `agent ${name}`, name });
}
