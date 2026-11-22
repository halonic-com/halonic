// The profile's plugin records, checked for the Plugins line of `halonic
// doctor` with or without a workspace (HAL-15916): a record file the person
// may not open, or a damaged one, breaks `halonic plugin list` and `plugin
// remove` for every plugin, so `doctor` names it with the same fix.

import {
  type PluginRecordProblem,
  pluginInstallsCollection,
  pluginSettingsCollection,
} from "@halonicjs/app";
import type { RecordStore } from "@halonicjs/ports";
import { DamagedPluginRecordError, UnreadablePluginRecordError } from "./plugin-record-store.ts";

/** Every collection the plugin records keep: where each plugin was added from, and its settings. */
const pluginCollections = [pluginInstallsCollection, pluginSettingsCollection];

/**
 * The first plugin record file, or their folder, that `records` can't read,
 * as a problem for the Plugins line; `null` when every one reads, or when
 * there are none yet. Any other error is thrown, as a bug.
 *
 * @param records - the profile's plugin records, through `PluginRecordStore`
 *
 * @example
 * await pluginRecordProblem(pluginRecordStore(profile));
 * // { problem: "records-damaged", file: "…/plugin-records/….jsonl", line: 2, why: "it is not JSON.", holds: "sources" }
 */
export async function pluginRecordProblem(
  records: Pick<RecordStore, "changes">,
): Promise<PluginRecordProblem | null> {
  for (const collection of pluginCollections) {
    try {
      await records.changes(collection);
    } catch (error) {
      const problem = recordProblemOf(error);
      if (problem === undefined) throw error;
      return problem;
    }
  }
  return null;
}

/**
 * The problem a plugin record refusal stands for, or `undefined` for any
 * other error. `withPluginProblems` uses it too, since the records' line
 * already covers the plugins they make unreadable.
 */
export function recordProblemOf(error: unknown): PluginRecordProblem | undefined {
  if (error instanceof UnreadablePluginRecordError) {
    const { place, path, access } = error;
    return { problem: "records-unreadable", place, path, access };
  }
  if (error instanceof DamagedPluginRecordError) {
    const { path, line, why, holds } = error;
    return { problem: "records-damaged", file: path, line, why, holds };
  }
  return undefined;
}
