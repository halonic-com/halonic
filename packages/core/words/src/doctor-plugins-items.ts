// The items of the doctor's Plugins line (`words.doctor-plugins`): each
// plugin a workspace's connector uses that isn't added, is off or can't be
// read (HAL-14296), the plugins folder the person may not list (HAL-15785),
// and a plugin record file that can't be read or is damaged (HAL-15916).

import type { DoctorPluginProblem, PluginRecordProblem, PluginsLine } from "@halonicjs/app";
import { doctorMessages } from "./doctor.ts";
import type { DoctorFace, DoctorLineItem } from "./doctor-lines.ts";
import { printable } from "./printable.ts";

/**
 * Each plugin problem: one that isn't added with the near id and the fix
 * under it, then one sentence for each plugin that is off, and one with its
 * fix for each that can't be read, or the plugins folder or a plugin record
 * file that can't be read, with its fix.
 */
export function pluginsItems(line: PluginsLine, face: DoctorFace): DoctorLineItem[] {
  return line.problems.flatMap((problem) => pluginProblem(problem, face));
}

function pluginProblem(problem: DoctorPluginProblem, face: DoctorFace): DoctorLineItem[] {
  if (problem.problem === "folder-unreadable") return pluginsFolderItems(problem, face);
  if (problem.problem === "records-unreadable" || problem.problem === "records-damaged") {
    return pluginRecordItems(problem, face);
  }
  // Connector and plugin ids come from the workspace's files and the plugins folder.
  const plugin = printable(problem.plugin);
  switch (problem.problem) {
    case "not-added": {
      const sentence = doctorMessages.pluginNotAdded(printable(problem.connector), plugin).phrase;
      if (problem.near === undefined) {
        return [{ sentence }, { fix: doctorMessages.addPlugin().phrase }];
      }
      const near = printable(problem.near);
      return [
        { sentence },
        { sentence: doctorMessages.pluginNear(near).phrase },
        { fix: doctorMessages.fixPluginId(printable(problem.connector), plugin, near).phrase },
      ];
    }
    case "off":
      return [
        {
          sentence: doctorMessages.pluginOff(plugin, problem.why, face.shellWord(problem.plugin))
            .phrase,
        },
      ];
    case "broken":
      return [
        { sentence: doctorMessages.pluginBroken(plugin).phrase },
        { fix: doctorMessages.removeBrokenPlugin(face.shellWord(problem.plugin)).phrase },
      ];
  }
}

/** The plugins folder the person may not list, with the plugins that are off for it and its fix. */
function pluginsFolderItems(
  problem: Extract<DoctorPluginProblem, { problem: "folder-unreadable" }>,
  face: DoctorFace,
): DoctorLineItem[] {
  // Plugin ids come from the workspace's files.
  const plugins = problem.plugins.map((plugin) => printable(plugin));
  const folder = printable(problem.folder);
  return [
    { sentence: doctorMessages.pluginsFolderUnreadable(folder, plugins).phrase },
    { fix: doctorMessages.fixPluginsFolder(problem.access, face.shellWord(problem.folder)).phrase },
  ];
}

/** The plugin record file or folder that can't be read, or the damaged file, with the fix `halonic plugin list` gives. */
function pluginRecordItems(problem: PluginRecordProblem, face: DoctorFace): DoctorLineItem[] {
  // The profile's paths can hold any character a file name may.
  if (problem.problem === "records-unreadable") {
    const { place, path, access } = problem;
    return [
      { sentence: doctorMessages.pluginRecordUnreadable(place, printable(path)).phrase },
      { fix: doctorMessages.fixPluginRecordAccess(place, access, face.shellWord(path)).phrase },
    ];
  }
  const { file, why, line, holds } = problem;
  return [
    { sentence: doctorMessages.pluginRecordDamaged(printable(file), printable(why), line).phrase },
    { fix: doctorMessages.fixDamagedPluginRecord(holds, line).phrase },
  ];
}
