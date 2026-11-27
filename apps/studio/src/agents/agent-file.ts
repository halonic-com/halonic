import {
  type Agent,
  allowedSiteProblem,
  defaultWorkingFolder,
  MAX_ALLOWED_SITES,
  workingFolderProblem,
} from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import type {
  AgentChange,
  AgentListing,
  AgentOutput,
  AgentSettings,
  TrashedAgent,
} from "@halonicjs/studio-feature-agents/api";
import { deleteWithUndo, type UndoableDeleteFiles } from "../files/undoable-delete.ts";
import { paramsOf, paramsProblem } from "./agent-params.ts";

/** The `output` as the file writes it: a JSON reply without a schema has no `schema` key. */
export function outputValue(output: AgentOutput): AgentOutput {
  return output.type === "json" && output.schema === undefined ? { type: "json" } : output;
}

/** Why a change can't be written, as the agent file's schema would refuse it; `undefined` when it can. */
export function changeProblem(change: AgentChange): string | undefined {
  if (change.name !== undefined && change.name.trim() === "") return "An agent needs a name.";
  const { maxSteps } = change;
  if (maxSteps !== undefined && !(Number.isInteger(maxSteps) && maxSteps >= 1 && maxSteps <= 200)) {
    return "The model call limit is a whole number from 1 to 200.";
  }
  if (change.output?.type === "choice" && change.output.options.length === 0) {
    return "A list of options needs at least one.";
  }
  if (change.params !== undefined) return paramsProblem(change.params);
  return sandboxProblem(change);
}

/**
 * Why a working folder or allowed sites can't be written, with the agent file's own checks; a site
 * gets the one line flow-agents 5.3 gives every invalid site.
 */
function sandboxProblem({ workingFolder, allowedSites }: AgentChange): string | undefined {
  const folderProblem = workingFolder === undefined ? null : workingFolderProblem(workingFolder);
  if (folderProblem !== null) return `${folderProblem}.`;
  if (allowedSites === undefined) return undefined;
  if (allowedSites.length > MAX_ALLOWED_SITES) return `Name at most ${MAX_ALLOWED_SITES} sites.`;
  return allowedSites.some((site) => allowedSiteProblem(site) !== null)
    ? "Enter a site like registry.npmjs.org."
    : undefined;
}

/** One agent's settings from its file, with the defaults the file leaves out. */
export function settingsOf(hubId: string, agent: Agent): AgentSettings {
  return {
    ...listingOf(hubId, agent),
    instructions: agent.instructions,
    output: agent.output,
    maxSteps: agent.maxSteps,
    params: paramsOf(agent.params),
    harness: agent.harness ?? "halonic",
    workingFolder: agent.workingFolder ?? defaultWorkingFolder(agent.id),
    allowedSites: agent.allowedSites ?? [],
    skills: agent.skills,
    knowledge: agent.knowledge,
    connectors: agent.connectors,
    subagents: agent.subagents,
    ...(agent.chatUi !== undefined && { chatUi: agent.chatUi.components }),
    agentSteps: Object.entries(agent.methods).map(([stepId, method]) => ({
      id: stepId,
      description: method.description,
      instructions: method.instructions,
      model: method.model,
      maxSteps: method.maxSteps,
      outputFields: method.output === "text" ? undefined : Object.keys(method.output),
      tools: method.tools,
    })),
  };
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
  return deleteWithUndo(files, { paths: [path], what: `agent ${name}` });
}
