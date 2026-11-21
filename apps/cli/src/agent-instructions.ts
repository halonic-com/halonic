import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { instructionFilesOf, pinInstructions } from "@halonicjs/adapter-harness-kit";
import type { InstructionPin } from "@halonicjs/ports";
import { filesOf, type LoadedFileOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { OwnLineError } from "./command.ts";
import { trustInstructionsMessages } from "./messages/trust-instructions.ts";
import { printable } from "./output/printable.ts";
import { skillFileOf } from "./skill-file.ts";

/** An agent's file in the workspace, as `halonic trust instructions` names it. */
export type AgentFile = LoadedFileOf<"agent">;

/**
 * The agent `typed` names: its id, such as `coder`, or its hub and id, such
 * as `support/coder`, when more than one hub has an agent with that id.
 *
 * @throws OwnLineError `not_found` when no agent has that id, or
 *   `invalid_input` when several hubs do and `typed` names no hub
 */
export function agentNamed(workspace: LoadedWorkspace, typed: string): AgentFile {
  const [hub, id] = typed.includes("/") ? typed.split("/", 2) : [undefined, typed];
  const matches = filesOf(workspace, "agent").filter(
    (file) => file.value.id === id && (hub === undefined || file.hub === hub),
  );
  const [only] = matches;
  if (only === undefined) {
    throw new OwnLineError(
      "not_found",
      trustInstructionsMessages.unknownAgent(printable(typed)),
      trustInstructionsMessages.unknownAgentFix(),
    );
  }
  if (matches.length > 1) {
    const choices = matches.map((file) => `${file.hub ?? "workspace"}/${file.value.id}`).join(", ");
    throw new OwnLineError(
      "invalid_input",
      trustInstructionsMessages.sameIdInHubs(printable(typed), printable(choices)),
      trustInstructionsMessages.sameIdInHubsFix(),
    );
  }
  return only;
}

/**
 * The pin of the agent's instructions as a harness run of it would start
 * with them from the saved files: the same files the run's trust check pins
 * (`instructionFilesOf`), so trusting this pin is trusting what the run checks.
 *
 * @param location - the workspace's folder, which a skill's file is read from
 * @returns `null` when the agent has no instructions and no skills, as a run then checks nothing
 * @throws when a selected skill has no file in the workspace, or can't be read
 */
export async function savedInstructionsPin(
  workspace: LoadedWorkspace,
  location: string,
  agent: AgentFile,
): Promise<InstructionPin | null> {
  const hubId = agent.hub ?? "";
  const files = await instructionFilesOf(agent.value, async (skillId) => {
    const file = skillFileOf(workspace, hubId, skillId);
    if (file === undefined) throw new Error(`The workspace has no skill "${skillId}".`);
    return await readFile(join(location, file.path), "utf8");
  });
  return files.length === 0 ? null : await pinInstructions(files);
}
