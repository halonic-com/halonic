import type { ChangesSource } from "@halonicjs/studio-feature-source-control/api";

/** What {@link fileChangedAt} reads of the workspace's versions. */
export type VersionsOfFiles = Pick<ChangesSource, "readHistory" | "listChangedSince">;

/** How many of the newest versions are looked through for the one that changed the file. */
const versionsLookedAt = 100;

/**
 * When a file changed into what is saved now, after `since`, for the warning's "changed on …"
 * line (checklist 3.8): the time of the newest version that changed it, as ISO text. Only when
 * the saved file is that version, and that version is newer than `since`: an edit saved since the
 * version, a file put back as it was before the choice, or a version older than the newest
 * {@link versionsLookedAt} has no time, rather than the wrong one.
 *
 * @param path - the file's path from the workspace folder
 * @param since - when the choice was made, as ISO text
 *
 * @example
 * await fileChangedAt(changes, "hubs/acme/agents/writer.yaml", "2026-11-09T10:00:00.000Z");
 * // "2026-11-09T14:02:00.000Z"
 */
export async function fileChangedAt(
  versions: VersionsOfFiles,
  path: string,
  since: string,
): Promise<string | undefined> {
  const history = await versions.readHistory(versionsLookedAt);
  const newest = history.find((version) => version.files.includes(path));
  if (newest === undefined || newest.at <= Date.parse(since)) return undefined;
  const changedSince = await versions.listChangedSince(newest.id);
  return changedSince.includes(path) ? undefined : new Date(newest.at).toISOString();
}
