import { isAbsolute, relative, resolve } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import {
  type ExtractedHub,
  type ExtractHubError,
  type ExtractPart,
  extractHub,
  loadWorkspace,
} from "@halonicjs/workspace";
import { type CliCommand, type CommandInput, UsageError } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { extractMessages } from "../../messages/extract.ts";
import { printable } from "../../output/printable.ts";
import { shownPath } from "../../shown-path.ts";
import {
  dirOption,
  givenDir,
  type OpenWorkspaceDir,
  openWorkspaceDir,
} from "../../workspace-dir.ts";
import { writeFailure } from "../../write-failure.ts";
import { ExtractFolderNotEmptyError, noHubError, WorkspaceHasErrorsError } from "./errors.ts";
import { type ExtractFolder, extractedLines, type FileOfPart, partsOf } from "./lines.ts";

/**
 * `halonic extract <hub> <new-folder> [--dir <folder>] [--dry-run]`: moves one
 * hub, and the shared items it uses, into a new workspace of its own in an
 * empty folder (the old `studio extract`, HAL-4845). The workspace it comes
 * from is left as it is. It starts nothing, so it needs no trust; the new
 * workspace is untrusted until `halonic trust`.
 */
export const extractCommand: CliCommand = {
  name: "extract",
  usage: "<hub> <new-folder> [--dir <folder>] [--dry-run]",
  summary: extractMessages.summary(),
  action: (input, context) => {
    const [hub = "", folder = ""] = input.positionals;
    return extractMessages.action(
      printable(hub),
      printable(shownPath(context.cwd, resolve(context.cwd, folder))),
    );
  },
  options: {
    dir: dirOption,
    "dry-run": { type: "boolean", description: extractMessages.dryRunOption() },
  },
  async run(input, context) {
    const { hub, folder } = parse(input, context.cwd);
    const workspace = await openWorkspaceDir(input, context);
    refuseInside(folder, workspace);

    const loaded = await loadWorkspace(workspace.store);
    const target = new FolderDefinitionStore(folder.root, folder.shown);
    const dryRun = input.options["dry-run"] === true;
    const result = await extractHub(loaded, workspace.store, target, hub, { dryRun }).catch(
      (error: unknown) => {
        throw writeFailure(error);
      },
    );
    if (!result.ok) {
      throw refusal(result.error, workspace.name, givenDir(input, workspace));
    }

    const files = partsOf(result.value);
    return {
      exitCode: exitCode.ok,
      lines: extractedLines(result.value, files, { folder, source: workspace, dryRun }),
      json: extractJson(result.value, files, folder, dryRun),
    };
  },
};

/** The hub and the new folder from the command line: exactly two words. */
function parse(input: CommandInput, cwd: string): { hub: string; folder: ExtractFolder } {
  const [hub, folder, ...rest] = input.positionals;
  if (hub === undefined || folder === undefined || rest.length > 0) {
    throw new UsageError(extractMessages.takesHubAndFolder());
  }
  const root = resolve(cwd, folder);
  return { hub, folder: { root, shown: shownPath(cwd, root), typed: relative(cwd, root) } };
}

/** The new workspace may not sit in the one it comes from, where it would be read as its files. */
function refuseInside(folder: ExtractFolder, workspace: OpenWorkspaceDir): void {
  const path = relative(workspace.root, folder.root);
  if (path === "" || !(path.startsWith("..") || isAbsolute(path))) {
    throw new UsageError(
      extractMessages.insideSource(printable(workspace.shown)),
      extractMessages.insideSourceFix(),
    );
  }
}

/** The error a plan or write that didn't happen ends the command with. */
function refusal(error: ExtractHubError, workspaceName: string, dir: string | undefined): Error {
  switch (error.kind) {
    case "unknown_hub":
      return noHubError(error.hub, error.hubs, printable(workspaceName));
    case "has_errors":
      return new WorkspaceHasErrorsError(error.errors, dir);
    case "not_empty":
      return new ExtractFolderNotEmptyError();
  }
}

/** `--json`: the hub, the folder, every file of the new workspace with its part, and what it took. */
function extractJson(
  extracted: ExtractedHub,
  files: readonly FileOfPart[],
  folder: ExtractFolder,
  dryRun: boolean,
) {
  return {
    hub: extracted.plan.hub,
    name: extracted.plan.settings.name,
    folder: folder.shown,
    dryRun,
    files: files.map(({ path, part }): { path: string; part: ExtractPart } => ({ path, part })),
    uses: extracted.plan.uses,
  };
}
