// The agents' and skills' files of the version a run reads, as one load read
// them (HAL-6477). The "On this computer" choice holds for an agent file's
// exact bytes, so the choice is checked against the file of the version that
// runs, never the file on disk now.

import type { DefinitionSource } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import {
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  loadWorkspace,
  skillFileOf,
} from "@halonicjs/workspace";
import { VersionRefusedError } from "./version-refused.ts";

/**
 * A version's workspace, with its agents' and skills' files as the load read
 * them. The saved files can change under a run, so the texts are taken with
 * the load and not read again from the source later.
 */
export interface LoadedVersion {
  readonly workspace: LoadedWorkspace;
  /** The text of each agent and skill file, by its workspace-relative path. */
  readonly fileTexts: ReadonlyMap<string, string>;
}

/** Loads the workspace from `source`, with the texts of its agents' and skills' files. */
export async function loadVersion(source: DefinitionSource): Promise<LoadedVersion> {
  return await versionWithTexts(await loadWorkspace(source), source);
}

/** `workspace`, loaded from `source`, with the texts of its agents' and skills' files read from the same source. */
export async function versionWithTexts(
  workspace: LoadedWorkspace,
  source: DefinitionSource,
): Promise<LoadedVersion> {
  const fileTexts = new Map<string, string>();
  for (const file of [...filesOf(workspace, "agent"), ...filesOf(workspace, "skill")]) {
    const text = await source.read(file.path);
    if (text !== null) fileTexts.set(file.path, text);
  }
  return { workspace, fileTexts };
}

/**
 * The agent's file in `loaded`, as UTF-8 bytes of the text the load read.
 *
 * @param found - hears the agent's loaded file before its bytes are read, such as a check that refuses it
 * @throws VersionRefusedError `no-agent-file` when the version has no such agent file
 */
export function agentFileIn(
  loaded: LoadedVersion,
  hubId: string,
  agentId: string,
  found?: (file: LoadedFileOf<"agent">) => void,
): Uint8Array {
  const file = filesOf(loaded.workspace, "agent").find(
    (each) => each.hub === hubId && each.value.id === agentId,
  );
  if (file !== undefined) found?.(file);
  const text = file === undefined ? undefined : loaded.fileTexts.get(file.path);
  if (text === undefined) {
    throw new VersionRefusedError({ reason: "no-agent-file", hubId, agentId });
  }
  return encodeUtf8(text);
}

/**
 * A skill's `SKILL.md` text in `loaded`, found as the hub sees the skill: its
 * own, else the shared one.
 *
 * @throws VersionRefusedError `no-skill` when the version has no such skill
 */
export function skillTextIn(loaded: LoadedVersion, hubId: string, skillId: string): string {
  const file = skillFileOf(loaded.workspace, hubId, skillId);
  const text = file === undefined ? undefined : loaded.fileTexts.get(file.path);
  if (text === undefined) {
    throw new VersionRefusedError({ reason: "no-skill", hubId, skillId });
  }
  return text;
}
