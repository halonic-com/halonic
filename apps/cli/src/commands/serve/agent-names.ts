import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/**
 * By id, each agent's name as its file in the served workspace says, for the
 * server's waiting list (requirement `cli.commands.serve.agent-names`). When
 * two files have the same id, the first one wins, as on the desktop.
 *
 * @param workspace reads the live version on each call, so a rename shows as soon as a version holds it, before any run starts from it
 */
export function workspaceAgentNames(
  workspace: () => Promise<LoadedWorkspace>,
): () => Promise<ReadonlyMap<string, string>> {
  return async () =>
    new Map(
      filesOf(await workspace(), "agent")
        .toReversed()
        .map(({ value }) => [value.id, value.name]),
    );
}
