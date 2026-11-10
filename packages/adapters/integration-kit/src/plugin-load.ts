// The checks a plugin needs when it loads, beyond its own file (ADR
// 2026-11-09-plugins, section 1.4): the SDK version this Halonic offers,
// and the backend's code against its backend. The checks inside
// `plugin.yaml` already ran in the format's `plugin` kind.
import { backendSheet, type Plugin } from "@halonicjs/format/integration";
import { type Integration, integrationVersion } from "@halonicjs/ports";
import { declarationProblems } from "./declaration.ts";
import type { LoadProblem } from "./load-problem.ts";

/**
 * Why a plugin that passed its own checks can't load: an `sdk` other than
 * this Halonic's `integrationVersion`, and, when the backend's code is
 * given, every way it differs from the backend, with the same rules as for
 * an integration and its sheet (`declarationProblems`) and each path
 * pointing into `plugin.yaml`. Empty when the plugin can load.
 *
 * @example
 * pluginLoadProblems(plugin, weather); // [] when the SDK and the code match
 */
export function pluginLoadProblems(plugin: Plugin, backendCode?: Integration): LoadProblem[] {
  const problems: LoadProblem[] = [];
  if (plugin.sdk !== integrationVersion) {
    problems.push({
      code: "sdk-version",
      path: ["sdk"],
      message: `${plugin.id}: built against SDK ${plugin.sdk}, but this Halonic offers SDK ${integrationVersion}`,
    });
  }
  if (backendCode !== undefined) {
    problems.push(...backendProblems(plugin, backendCode));
  }
  return problems;
}

function backendProblems(plugin: Plugin, backendCode: Integration): LoadProblem[] {
  const sheet = backendSheet(plugin);
  if (sheet === undefined) {
    return [
      {
        code: "backend-not-declared",
        path: [],
        message: `${plugin.id}: the plugin has backend code, but plugin.yaml has no backend`,
      },
    ];
  }
  // The sheet's `kit` is the plugin's `sdk`, already reported above.
  return declarationProblems(sheet, backendCode)
    .filter((problem) => problem.code !== "kit-version")
    .map((problem) => ({ ...problem, path: pluginPath(problem.path) }));
}

/**
 * A sheet path as a path in `plugin.yaml`: `id` and `version` are the
 * plugin's own, everything else sits under `backend`.
 */
function pluginPath(path: LoadProblem["path"]): LoadProblem["path"] {
  const [first] = path;
  if (first === "id" || first === "version") {
    return path;
  }
  return ["backend", ...path];
}
