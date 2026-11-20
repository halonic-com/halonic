import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/**
 * By id, each agent's name as its file in the served workspace says, for the
 * server's waiting list (requirement `cli.commands.serve.agent-names`). When
 * two files have the same id, the first one wins, as on the desktop.
 *
 * @param workspace the workspace served now, read on each call, so a rename shows once a new live version holds it
 */
export function workspaceAgentNames(
  workspace: () => LoadedWorkspace,
): () => Promise<ReadonlyMap<string, string>> {
  return async () =>
    new Map(
      filesOf(workspace(), "agent")
        .toReversed()
        .map(({ value }) => [value.id, value.name]),
    );
}
