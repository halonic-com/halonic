import type { VersionHistoryHost } from "@halonicjs/studio-feature-runs/api";
import type { ChangesSource } from "@halonicjs/studio-feature-source-control/api";

/**
 * The run page's view of the workspace's history: whether it has a version at all, read as
 * Changes reads it. A folder without git, without a repository or without a version has none.
 *
 * @example
 * services.provide(VersionHistoryHostService, versionHistoryOf(changes));
 */
export function versionHistoryOf(changes: Pick<ChangesSource, "readHistory">): VersionHistoryHost {
  return { hasVersions: async () => (await changes.readHistory(1)).length > 0 };
}
