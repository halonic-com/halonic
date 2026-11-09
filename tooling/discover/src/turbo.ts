import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CheckContext, type Problem, Report } from "@halonicjs/tooling-check";
import { type FolderDiscovery, generatedFolderFile } from "./folder-discovery.ts";

/** The Turbo config whose codegen task must know every discovery's inputs and output. */
export const turboFile = "turbo.json";

/** The root task that runs `pnpm discover` before every typecheck, test and build. */
export const codegenTask = "//#codegen";

interface TaskGlobs {
  inputs: string[];
  outputs: string[];
}

/**
 * What the codegen task must list for these discoveries. Without them Turbo
 * would replay a cached, stale generated file after a folder is added.
 */
export function requiredCodegenGlobs(discoveries: readonly FolderDiscovery[]): TaskGlobs {
  const inputs = new Set<string>();
  const outputs = new Set<string>();
  for (const discovery of discoveries) {
    inputs.add(`${discovery.packageDirectory}/package.json`);
    inputs.add(`${discovery.packageDirectory}/${discovery.folder}/*/${discovery.file}`);
    outputs.add(generatedFolderFile(discovery));
  }
  return { inputs: [...inputs], outputs: [...outputs] };
}

function readCodegenTask(root: string): { config: Record<string, unknown>; task: TaskGlobs } {
  const config = JSON.parse(readFileSync(join(root, turboFile), "utf8")) as {
    tasks?: Record<string, Partial<TaskGlobs>>;
  };
  const task = config.tasks?.[codegenTask];
  return {
    config,
    task: { inputs: task?.inputs ?? [], outputs: task?.outputs ?? [] },
  };
}

function missingGlobs(task: TaskGlobs, required: TaskGlobs): TaskGlobs {
  return {
    inputs: required.inputs.filter((glob) => !task.inputs.includes(glob)),
    outputs: required.outputs.filter((glob) => !task.outputs.includes(glob)),
  };
}

/** Reports the inputs and outputs the codegen task is missing for these discoveries. */
export function turboProblems(
  context: CheckContext,
  discoveries: readonly FolderDiscovery[],
): Problem[] {
  const report = new Report("discover");
  if (!existsSync(join(context.root, turboFile))) {
    return report.problems;
  }
  const missing = missingGlobs(
    readCodegenTask(context.root).task,
    requiredCodegenGlobs(discoveries),
  );
  for (const [field, globs] of Object.entries(missing)) {
    for (const glob of globs) {
      report.error(
        turboFile,
        `"${codegenTask}" ${field} is missing "${glob}". Run "pnpm discover --fix".`,
      );
    }
  }
  return report.problems;
}

/**
 * Adds the inputs and outputs the codegen task is missing. It never removes
 * any, so the feature list's globs stay.
 *
 * @returns true if the file changed
 */
export function fixTurboInputs(
  context: CheckContext,
  discoveries: readonly FolderDiscovery[],
): boolean {
  if (!existsSync(join(context.root, turboFile))) {
    return false;
  }
  const { config, task } = readCodegenTask(context.root);
  const missing = missingGlobs(task, requiredCodegenGlobs(discoveries));
  if (missing.inputs.length === 0 && missing.outputs.length === 0) {
    return false;
  }
  const tasks = (config["tasks"] ?? {}) as Record<string, Record<string, unknown>>;
  tasks[codegenTask] = {
    ...tasks[codegenTask],
    inputs: [...task.inputs, ...missing.inputs],
    outputs: [...task.outputs, ...missing.outputs],
  };
  config["tasks"] = tasks;
  writeFileSync(join(context.root, turboFile), `${JSON.stringify(config, null, 2)}\n`);
  return true;
}
