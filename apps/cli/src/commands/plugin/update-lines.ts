// The lines `halonic plugin add --update` prints ahead of the trust check,
// about the copy it replaced: that it came from another source (HAL-16292),
// and which files changed since it (C696 #4, HAL-16319).

import { type PluginFileHash, type PluginInstall, pluginFileChanges } from "@halonicjs/app";
import type { CommandContext } from "../../command.ts";
import { markPart, type Phrase, phrase, plainText } from "../../messages/phrase.ts";
import { pluginMessages } from "../../messages/plugin.ts";
import { shownPluginSource } from "../../output/plugin-source.ts";
import { printable } from "../../output/printable.ts";
import type { PluginSetup } from "../../plugin-host.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";

/** How many changed paths the files line names before "and N more". */
const shownPaths = 10;

/**
 * The lines ahead of the check once `--update` replaced `replaced`, the
 * install record it had, with a copy from `from` whose files are `files`;
 * each is printed ahead too. None for a plain add (`replaced` undefined).
 */
export function updateLines(
  replaced: PluginInstall | null | undefined,
  from: PluginInstall["source"],
  files: readonly PluginFileHash[],
  context: CommandContext,
  setup: PluginSetup,
): Phrase[] {
  if (replaced === undefined || replaced === null) return [];
  const lines = [...movedLine(replaced.source, from, setup), ...filesLine(replaced.files, files)];
  for (const line of lines) context.printAhead(line);
  return lines;
}

/**
 * "! Updating from a different source: ~/acme/weather → ~/new/weather. …",
 * when the replaced plugin was added from another folder or git address,
 * since its secrets and sign-ins carry over to the new copy (HAL-16292);
 * nothing for the same folder, or a new commit of the same address.
 */
function movedLine(
  replaced: PluginInstall["source"],
  from: PluginInstall["source"],
  setup: PluginSetup,
): Phrase[] {
  if (sameSource(replaced, from)) return [];
  const profile = setup.profile ?? nodeProfileEnvironment();
  const before = printable(shownPluginSource(replaced, profile));
  const after = printable(shownPluginSource(from, profile));
  return [phrase`${markPart("needsYou")} ${pluginMessages.updateMoved(before, after).phrase}`];
}

/** The same folder, or the same git address at any commit. */
function sameSource(a: PluginInstall["source"], b: PluginInstall["source"]): boolean {
  if (a.kind === "folder" && b.kind === "folder") return a.path === b.path;
  if (a.kind === "git" && b.kind === "git") return a.address === b.address;
  return false;
}

/**
 * "! Files changed since the copy it replaces: changed backend/index.js; new
 * backend/extra.js.", the first {@link shownPaths} paths; nothing when the
 * files are the same.
 */
function filesLine(before: readonly PluginFileHash[], after: readonly PluginFileHash[]): Phrase[] {
  const changes = pluginFileChanges(before, after);
  const kinds = [
    ["changed", changes.changed],
    ["added", changes.added],
    ["removed", changes.removed],
  ] as const;
  let left = shownPaths;
  const parts: string[] = [];
  for (const [kind, paths] of kinds) {
    if (paths.length === 0 || left === 0) continue;
    const shown = paths.slice(0, left).map((path) => printable(path));
    left -= shown.length;
    parts.push(plainText(pluginMessages.updateFilesPart(kind, shown.join(", ")).phrase));
  }
  if (parts.length === 0) return [];
  const total = changes.changed.length + changes.added.length + changes.removed.length;
  if (total > shownPaths) {
    parts.push(plainText(pluginMessages.updateFilesMore(total - shownPaths).phrase));
  }
  return [phrase`${markPart("needsYou")} ${pluginMessages.updateFiles(parts).phrase}`];
}
