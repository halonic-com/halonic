// The agents' files and skills' text a run's instructions are pinned from
// (HAL-17020): split out of `local-harness-host.ts`.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessAgent } from "@halonicjs/engine";
import type { AgentFiles } from "@halonicjs/host-harness-host";
import { filesOf, skillFileOf } from "@halonicjs/workspace";
import type { LocalHarnessInput } from "./local-harness-types.ts";

/**
 * The agents' files, found by hub and id in the loaded workspace: as the
 * run's version has them when the command gave its files, else as they are
 * on disk now.
 */
export function agentFilesOf(
  input: Pick<LocalHarnessInput, "versions" | "runFiles" | "workspace" | "location">,
): AgentFiles {
  return {
    bytesOf: async (hubId, agentId, run) => {
      const ofVersion = input.versions ?? input.runFiles;
      if (ofVersion !== undefined) {
        return await ofVersion.agentFileOf(run, hubId, agentId);
      }
      const file = filesOf(input.workspace(), "agent").find(
        (each) => each.hub === hubId && each.value.id === agentId,
      );
      if (file === undefined) {
        throw new Error(`Hub "${hubId}" has no agent "${agentId}".`);
      }
      return new Uint8Array(await readFile(join(input.location, file.path)));
    },
  };
}

/**
 * A skill's `SKILL.md` as the run's version has it when the command gave its
 * files, else as it is on disk now, so the agent's file and its skills in
 * one pin are from one version: the one `halonic trust instructions` reviews.
 */
export function skillTextOf(
  input: Pick<LocalHarnessInput, "versions" | "runFiles" | "workspace" | "location">,
): (agent: HarnessAgent, id: string) => Promise<string> {
  return async (agent, id) => {
    const ofVersion = input.versions ?? input.runFiles;
    if (ofVersion !== undefined) {
      return await ofVersion.skillTextOf(agent, agent.hubId, id);
    }
    const file = skillFileOf(input.workspace(), agent.hubId, id);
    if (file === undefined) throw new Error(`The workspace has no skill "${id}".`);
    return await readFile(join(input.location, file.path), "utf8");
  };
}
