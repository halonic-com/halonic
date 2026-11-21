// Where a plugin was added from, written one way for `halonic plugin list`
// and the trust check's "Copied from" line (HAL-15142), so the same source
// looks the same in both.

import type { PluginInstall } from "@halonicjs/app";
import { type ProfileEnvironment, withHomeAsTilde } from "@halonicjs/profile";

/** How many characters of a commit are shown, as git does. */
const shownCommitLength = 7;

/**
 * A plugin's source as the CLI shows it: a git address without its scheme
 * and `.git`, with the short commit, or a folder with the home folder
 * written as `~`.
 *
 * @example
 * shownPluginSource({ kind: "git", address: "https://example.com/acme/weather.git", commit: "c9b6e41d…" }, profile);
 * // "example.com/acme/weather@c9b6e41"
 */
export function shownPluginSource(
  source: PluginInstall["source"],
  profile: ProfileEnvironment,
): string {
  if (source.kind === "git") {
    const address = source.address.replace(/^[a-z+]+:\/\//, "").replace(/\.git$/, "");
    return `${address}@${source.commit.slice(0, shownCommitLength)}`;
  }
  return withHomeAsTilde(profile.platform, profile.homeFolder, source.path);
}
