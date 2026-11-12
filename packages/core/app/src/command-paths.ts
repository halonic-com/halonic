// Where each connector's program is on this computer. The trust check
// fingerprints that path with the command, so a program that changes place
// changes the fingerprint. The search itself is injected: the CLI looks in
// `PATH` with Node, the Studio asks its shell, and both fingerprint one
// workspace the same way as long as they find the same program.

import type { Connector } from "@halonicjs/format";

/** Where one command would start from: its absolute path, or `null` when it isn't found or holds a folder. */
export type CommandFinder = (command: string) => Promise<string | null>;

/**
 * The absolute path of each stdio connector's command, by the command as
 * written, as the trust check takes it (`commandPaths`). A command `find`
 * doesn't find is left out, so the trust check fingerprints the command alone.
 *
 * @example
 * await commandPaths([mailConnector], async () => "/usr/bin/npx");
 * // Map { "npx" => "/usr/bin/npx" }
 */
export async function commandPaths(
  connectors: readonly Connector[],
  find: CommandFinder,
): Promise<Map<string, string>> {
  const commands = new Set(
    connectors.flatMap((connector) =>
      "stdio" in connector.transport ? [connector.transport.stdio.command] : [],
    ),
  );
  const paths = new Map<string, string>();
  for (const command of commands) {
    const path = await find(command);
    if (path !== null) paths.set(command, path);
  }
  return paths;
}
