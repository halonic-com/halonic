// The folders harness agents write in, for whoever starts a local
// connector's program (stack 4h of the HAL-189 plan, conditions from
// Julian's check on HAL-4739). A harness agent writes in its working folder
// from inside the sandbox, while a connector's program runs outside it, so
// the program's starter refuses a start that would run or load a file from
// one of them (`ConnectorFactoryContext.workingFolders`).

import { defaultWorkingFolder } from "@halonicjs/format";
import { filesOf, type LoadedWorkspace } from "./load-workspace.ts";

/**
 * The working folder of every harness agent in the workspace, in every hub:
 * each agent whose `harness` is set and isn't `halonic`, with
 * `files/agents/<id>` when its file names no folder. Not only the agents of
 * the run that starts the program: an agent of any workflow may have
 * written there before. Relative to the workspace root, as the agent file
 * wrote them (the loader refuses `.`, `..` and empty parts), each once,
 * sorted.
 *
 * The caller resolves them to real absolute paths against the workspace's
 * real path before passing them on.
 *
 * @example
 * harnessWorkingFolders(workspace); // ["files/agents/coder", "scripts"]
 */
export function harnessWorkingFolders(workspace: LoadedWorkspace): string[] {
  const folders = new Set<string>();
  for (const { value: agent } of filesOf(workspace, "agent")) {
    if (agent.harness === undefined || agent.harness === "halonic") continue;
    folders.add(agent.workingFolder ?? defaultWorkingFolder(agent.id));
  }
  return [...folders].sort(compareText);
}

/** Compares by code unit, so the order is the same on every machine and locale. */
function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
