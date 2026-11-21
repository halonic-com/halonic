import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { instructionFilesOf, pinInstructions } from "@halonicjs/adapter-harness-kit";
import type { InstructionPin } from "@halonicjs/ports";
import { filesOf, type LoadedFileOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { OwnLineError } from "./command.ts";
import { harnessNames } from "./messages/harness-names.ts";
import { phrase } from "./messages/phrase.ts";
import { trustInstructionsMessages } from "./messages/trust-instructions.ts";
import type { InstructionSource, InstructionsAbout } from "./output/instruction-trust-lines.ts";
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

/** A skill's file in a pin, as `instructionFilesOf` names it: `skills/<id>/SKILL.md`. */
const skillInPin = /^skills\/(?<id>[^/]+)\/SKILL\.md$/u;

/**
 * Where a person reads each file of the agent's pin: `AGENTS.md` is the
 * `instructions` in the agent's own file, and `skills/<id>/SKILL.md` is the
 * skill's file in the workspace, which a removed skill may no longer have.
 * The pin's names are the run's, not the person's, so the rows name these.
 *
 * @example
 * instructionSourcesOf(workspace, coder)("skills/review/SKILL.md");
 * // { label: "Skill review", path: "hubs/lab/library/skills/review/SKILL.md" } (the label as a phrase)
 */
export function instructionSourcesOf(
  workspace: LoadedWorkspace,
  agent: AgentFile,
): (name: string) => InstructionSource {
  return (name) => {
    if (name === "AGENTS.md") {
      return { label: trustInstructionsMessages.instructionsRow().phrase, path: agent.path };
    }
    const skillId = skillInPin.exec(name)?.groups?.["id"];
    if (skillId === undefined) {
      return { label: phrase`${printable(name)}`, path: undefined };
    }
    return {
      label: trustInstructionsMessages.skillRow(printable(skillId)).phrase,
      path: skillFileOf(workspace, agent.hub ?? "", skillId)?.path,
    };
  };
}

/** What the trust lines say about `agent`: its harness's name and where each of its files is. */
export function instructionsAbout(workspace: LoadedWorkspace, agent: AgentFile): InstructionsAbout {
  const harness = agent.value.harness;
  return {
    harness: harness === undefined ? undefined : harnessNames.get(harness),
    sourceOf: instructionSourcesOf(workspace, agent),
  };
}
