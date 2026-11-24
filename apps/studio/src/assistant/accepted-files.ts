// The workspace as the person accepted it, for the Build chat's authoring skill
// (`assistant.build.authoring-skill-override`, HAL-17357): a `halonic-authoring`
// skill the assistant proposed steers no answer until the person accepts it.

import type { ReviewService } from "@halonicjs/app";
import { authoringSkillPath } from "@halonicjs/assistant";
import { type DefinitionSource, isLeftOut } from "@halonicjs/ports";

/** Whether `path` is a `halonic-authoring` skill's file, at the root or in a hub. */
export function isAuthoringSkillPath(path: string): boolean {
  return path === authoringSkillPath || path.endsWith(`/${authoringSkillPath}`);
}

/**
 * The workspace's files with the changes to review in `paths` left out: each of those files reads
 * as its baseline (the file with every open assistant change rejected), and one the assistant
 * created isn't there. Other files read as they are.
 */
export async function acceptedFiles(
  files: DefinitionSource,
  review: Pick<ReviewService, "changesIn">,
  paths: readonly string[],
): Promise<DefinitionSource> {
  const baselines = new Map<string, string | null>();
  for (const path of paths) {
    const changes = await review.changesIn(path);
    if (changes !== null) baselines.set(path, changes.baseline);
  }
  return {
    location: files.location,
    list: async (dir, options) => {
      const listed = new Set(await files.list(dir, options));
      const prefix = dir === undefined ? "" : `${dir.replace(/\/+$/u, "")}/`;
      for (const [path, baseline] of baselines) {
        if (baseline === null) listed.delete(path);
        else if (path.startsWith(prefix) && !isLeftOut(path, options?.leaveOut)) listed.add(path);
      }
      return [...listed].sort();
    },
    read: async (path) => {
      const baseline = baselines.get(path);
      return baseline === undefined ? files.read(path) : baseline;
    },
    version: (options) => files.version(options),
  };
}
