// The file a connector was loaded from, for a fix line that says where to
// change it (HAL-13670): the CLI names connector files by their path, as
// `halonic validate` and `halonic trust` do.

import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { printable } from "./output/printable.ts";

/**
 * The workspace-relative path of the file that holds connector `id`, made
 * safe to print.
 *
 * @returns the path, or `undefined` when no file in the workspace holds it,
 *   as for a connector that comes from the hub
 * @example
 * connectorFileOf(workspace, "mail"); // "library/connectors/mail.connector.yaml"
 */
export function connectorFileOf(workspace: LoadedWorkspace, id: string): string | undefined {
  const file = connectorFile(workspace, id);
  return file === undefined ? undefined : printable(file.path);
}

/**
 * Whether connector `id` is a local integration's (`transport: { integration }`),
 * whose tools come from the integration's runner rather than a program or
 * a server of its own (HAL-15250).
 *
 * @example
 * isIntegrationConnector(workspace, "issues"); // true for `transport: { integration: { folder: issues } }`
 */
export function isIntegrationConnector(workspace: LoadedWorkspace, id: string): boolean {
  const file = connectorFile(workspace, id);
  return file !== undefined && "integration" in file.value.transport;
}

function connectorFile(workspace: LoadedWorkspace, id: string) {
  return filesOf(workspace, "connector").find((candidate) => candidate.value.id === id);
}
