// Rules about a workspace's trust content that `TrustService` applies:
// which connectors aren't pinned, and whether a record's content has the
// shape `trustContent` builds.

import type { Connector } from "@halonicjs/format";
import type { TrustContent } from "@halonicjs/workspace";
import { isPackageRunner } from "./package-runner.ts";

/**
 * The ids of the connectors that start a package runner, found the same way
 * the launcher finds them (`app.package-runner-launch`), so the two agree.
 */
export function unpinnedConnectors(connectors: readonly Connector[]): string[] {
  const ids: string[] = [];
  for (const connector of connectors) {
    const { transport } = connector;
    if ("stdio" in transport && isPackageRunner(transport.stdio.command, transport.stdio.args)) {
      ids.push(connector.id);
    }
  }
  return ids.sort();
}

/**
 * Whether stored content has the shape `trustContent` builds: connectors,
 * and harness agents and local integrations when there are any, with an id
 * each.
 */
export function isTrustContent(value: unknown): value is TrustContent {
  if (typeof value !== "object" || value === null || !("connectors" in value)) {
    return false;
  }
  const agents = "agents" in value ? value.agents : [];
  const integrations = "integrations" in value ? value.integrations : [];
  return hasIds(value.connectors) && hasIds(agents) && hasIds(integrations);
}

/** Whether the value is a list whose every entry has a text `id`. */
function hasIds(list: unknown): boolean {
  return (
    Array.isArray(list) &&
    list.every(
      (entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        "id" in entry &&
        typeof entry.id === "string",
    )
  );
}
