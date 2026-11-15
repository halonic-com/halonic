import { dirname } from "node:path";

/**
 * The read-only folder a runner gets for Node: the folder holding the Node
 * executable and nothing above it. The host and the fence's attack cases both
 * build it here, so the cases run against the grant the host really gives and
 * fail when this one widens.
 *
 * @example
 * runnerNodeFolder("/opt/node/bin/node"); // "/opt/node/bin"
 */
export function runnerNodeFolder(nodeExecutable: string): string {
  return dirname(nodeExecutable);
}
