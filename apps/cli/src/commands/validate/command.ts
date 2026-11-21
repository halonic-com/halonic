import { workspaceProblemsOf } from "@halonicjs/adapter-workspace-models";
import { loadWorkspace, type WorkspaceIssue } from "@halonicjs/workspace";
import type { CliCommand, CommandInput } from "../../command.ts";
import { type AddedPlugin, addedPluginsOf } from "../../connector-plugin.ts";
import { exitCode } from "../../exit-code.ts";
import { validateMessages } from "../../messages/validate.ts";
import {
  type ValidateReport,
  validateFails,
  validateLines,
  validateReport,
} from "../../output/validate-report.ts";
import { pluginConnectorProblems } from "../../plugin-connector-problems.ts";
import { openPluginService } from "../../plugin-host.ts";
import { computerSheetHosts } from "../../sheet-hosts.ts";
import { dirOption, givenDir, openWorkspaceDir, workspaceDir } from "../../workspace-dir.ts";

/**
 * `halonic validate [--dir <folder>] [--all] [--strict]`: checks every file of
 * the workspace and lists what to fix, grouped by file (cli-output 3.2). It
 * starts nothing, so it needs no trust and no sandbox. It reads the installed
 * plugins and the local integrations, so `privacy.localOnly` counts the hosts
 * their sheets list, and a plugin connector whose plugin isn't added gets a
 * warning.
 */
export const validateCommand: CliCommand = {
  name: "validate",
  usage: "[--dir <folder>] [--all] [--strict]",
  strayArgumentFix: (folder) => validateMessages.folderWithoutDir(folder),
  summary: validateMessages.summary(),
  action: (input, context) => validateMessages.action(actionFolder(input, context.cwd)),
  options: {
    dir: dirOption,
    all: { type: "boolean", description: validateMessages.allOption() },
    strict: { type: "boolean", description: validateMessages.strictOption() },
  },
  async run(input, context) {
    const workspace = await openWorkspaceDir(input, context);
    const strict = input.options["strict"] === true;
    const sheetHosts = await computerSheetHosts(workspace.root, workspace.shown);
    const loaded = await loadWorkspace(workspace.store, { sheetHosts });
    const added = await addedPlugins();
    const report = validateReport({
      ...loaded,
      issues: [
        ...workspaceProblemsOf(loaded),
        ...(added === undefined ? [] : pluginConnectorProblems(loaded, added)),
      ],
    });
    const dir = givenDir(input, workspace);
    return {
      exitCode: validateFails(report, strict) ? exitCode.failed : exitCode.ok,
      lines: validateLines(report, {
        workspace: workspace.name,
        all: input.options["all"] === true,
        strict,
        ...(dir === undefined ? {} : { dir }),
      }),
      json: validateJson(report),
    };
  },
};

/**
 * The plugins added on this computer, or `undefined` when the plugins folder
 * can't be listed: `validate` then can't tell which are missing, so it
 * reports none, and `plugin list` says why the folder can't be read.
 */
async function addedPlugins(): Promise<readonly AddedPlugin[] | undefined> {
  return await addedPluginsOf(openPluginService({}))().catch(() => undefined);
}

/**
 * The folder in "Couldn't check ./downloads": the user's `--dir` as typed
 * from here, or the current folder's name without one.
 */
function actionFolder(input: CommandInput, cwd: string): string {
  const dir = workspaceDir(input, cwd);
  return typeof input.options["dir"] === "string" ? dir.shown : dir.name;
}

/** `--json`: the fields the CLI reference lists, with every problem, never capped. */
function validateJson({ problems, counts }: ValidateReport) {
  return {
    files: counts.checked,
    errors: counts.errors,
    warnings: counts.warnings,
    problems: problems.map(problemJson),
  };
}

/** A problem as the CLI reference lists it; `fix` is left out until problems carry one. */
function problemJson(problem: WorkspaceIssue) {
  return {
    file: problem.file,
    line: problem.line,
    col: problem.col,
    severity: problem.severity,
    code: problem.code,
    message: problem.message,
  };
}
