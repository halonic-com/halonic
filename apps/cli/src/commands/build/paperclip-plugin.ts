// `halonic build paperclip-plugin`: builds a Paperclip plugin of the
// workspace's tools, templates, signals and routing (plan HAL-17950,
// HAL-18153, HAL-18365, HAL-18263). A thin command over the plugin build
// app service: this file reads the workspace, its commit, the runtime and
// the previous build, and writes the archive and the release file. It never
// installs anything and never reaches Paperclip or the network.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { GitRunnerOptions } from "@halonicjs/adapter-git";
import { workspaceProblemsOf } from "@halonicjs/adapter-workspace-models";
import {
  type BuiltPlugin,
  buildWorkspacePlugin,
  type PluginBuildProblem,
  type PluginRuntime,
} from "@halonicjs/app";
import { isPluginVersion, pluginIdPrefix } from "@halonicjs/plugin-build";
import { encodeUtf8 } from "@halonicjs/std";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  DetailedError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { buildMessages } from "../../messages/build.ts";
import { columns } from "../../messages/columns.ts";
import { type Phrase, phrase } from "../../messages/phrase.ts";
import { shippedPluginRuntime } from "../../paperclip-runtime.ts";
import { shownPath } from "../../shown-path.ts";
import { halonicVersion } from "../../version.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { webCryptoDigest } from "../../workspace-runs.ts";
import { previousBuildFiles, previousBuildRefusal } from "./previous-build-files.ts";
import { workspaceCommit } from "./workspace-commit.ts";

/** What tests can fix; left out, the shipped runtime and the git on the `PATH`. */
export interface PluginBuildSetup {
  readonly runtime?: () => Promise<PluginRuntime>;
  readonly git?: GitRunnerOptions;
}

/**
 * Builds the plugin and writes `<plugin id>-<version>.tar` and its
 * `.release.json` into `--out`.
 *
 * @throws UsageError for a `--plugin-version` that isn't `x.y.z`
 * @throws DetailedError when the build service refuses the workspace, its commit or the previous build,
 *   or the runtime's worker isn't built
 */
export async function buildPaperclipPlugin(
  input: CommandInput,
  context: CommandContext,
  setup: PluginBuildSetup,
): Promise<CommandResult> {
  const requested = textOption(input, "plugin-version");
  if (requested !== undefined && !isPluginVersion(requested)) {
    throw new UsageError(buildMessages.badVersion(requested));
  }
  const workspace = await openWorkspaceDir(input, context);
  const loaded = await loadWorkspace(workspace.store);
  const errors = workspaceProblemsOf(loaded).filter((issue) => issue.severity === "error");
  const tools = filesOf(loaded, "tool");
  const templates = filesOf(loaded, "template");
  const signals = filesOf(loaded, "signal");
  const routing = filesOf(loaded, "routing");
  const commit = await workspaceCommit(
    workspace.root,
    [...tools, ...templates, ...signals, ...routing].map((file) => file.path),
    setup.git,
  );
  const since = textOption(input, "since");
  const previous =
    since === undefined ? undefined : await previousBuildFiles(resolve(context.cwd, since), since);
  const runtime = await (setup.runtime ?? shippedPluginRuntime)();
  // `openWorkspaceDir` checked that `workspace.yaml` reads, and the load found no error.
  const settings = filesOf(loaded, "workspace")[0]?.value ?? { id: "", name: "" };
  const built = await buildWorkspacePlugin(
    {
      workspace: {
        id: settings.id,
        name: settings.name,
        errors: errors.length,
        commit,
        tools: tools.map((file) => file.value),
        templates: templates.map((file) => file.value),
        signals: signals.map((file) => file.value),
        ...(routing[0] === undefined ? {} : { routing: routing[0].value }),
      },
      runtime,
      ...(previous === undefined ? {} : { previous }),
      ...(requested === undefined ? {} : { version: requested }),
      halonicVersion,
    },
    webCryptoDigest,
  );
  if (!built.ok) throw refusalOf(built.error, since ?? "");
  const out = resolve(context.cwd, textOption(input, "out") ?? ".");
  await mkdir(out, { recursive: true });
  await writeOnce(out, built.value.archiveName, built.value.archive, context.cwd);
  await writeOnce(out, built.value.releaseName, encodeUtf8(built.value.releaseText), context.cwd);
  return builtResult(built.value, out, context.cwd);
}

/** The result: the heading, then the archive, release file, sha-256 and changes, lined up. */
function builtResult(built: BuiltPlugin, out: string, cwd: string): CommandResult {
  const { release } = built;
  const { added, removed, changed, routing = [], signals } = release.changes;
  const changes =
    added.length + removed.length + changed.length + routing.length === 0 && signals === undefined
      ? buildMessages.noChanges()
      : buildMessages.changes(
          added,
          removed,
          changed.map((tool) => tool.tool),
          routing,
          signals,
        );
  const archive = shownPath(cwd, join(out, built.archiveName));
  const releaseFile = shownPath(cwd, join(out, built.releaseName));
  const rows: Phrase[][] = [
    [buildMessages.archiveLabel().phrase, phrase`${archive}`],
    [buildMessages.releaseLabel().phrase, phrase`${releaseFile}`],
    [buildMessages.sha256Label().phrase, phrase`${release.sha256}`],
    [buildMessages.changesLabel().phrase, changes.phrase],
  ];
  return {
    exitCode: exitCode.ok,
    lines: [
      buildMessages.built(release.pluginId, release.version, release.workspaceCommit.slice(0, 7))
        .phrase,
      ...columns(rows).map((line) => [`  `, ...line]),
    ],
    json: { ...release, archive, releaseFile },
  };
}

/**
 * Writes a file the build made. An identical file already there is left as
 * it is, since a rebuild gives the same bytes; a different one is never
 * overwritten.
 *
 * @throws DetailedError `conflict` when the folder already has a different file of that name
 */
async function writeOnce(folder: string, name: string, bytes: Uint8Array, cwd: string) {
  const path = join(folder, name);
  const existing = await readFile(path).catch(() => undefined);
  if (existing === undefined) {
    await writeFile(path, bytes, { flag: "wx" });
    return;
  }
  if (Buffer.compare(existing, bytes) !== 0) {
    throw new DetailedError(
      "conflict",
      buildMessages.fileExists(shownPath(cwd, path)),
      buildMessages.fileExistsFix(),
    );
  }
}

/** A refusal from the build service, in the CLI's words. */
function refusalOf(problem: PluginBuildProblem, since: string): Error {
  switch (problem.code) {
    case "workspace-errors":
      return new DetailedError(
        "invalid_input",
        buildMessages.workspaceErrors(problem.errors),
        buildMessages.workspaceErrorsFix(),
      );
    case "no-repository":
      return new DetailedError("conflict", buildMessages.notInGit(), buildMessages.notInGitFix());
    case "no-commit":
      return new DetailedError("conflict", buildMessages.noCommit(), buildMessages.commitFix());
    case "uncommitted":
      return new DetailedError(
        "conflict",
        buildMessages.uncommitted(problem.files),
        buildMessages.commitFix(),
        { files: problem.files },
      );
    case "bad-plugin-id":
      return new DetailedError(
        "invalid_input",
        buildMessages.badPluginId(problem.pluginId.slice(pluginIdPrefix.length)),
      );
    case "bad-version":
      // The command checks --plugin-version first, so this is the --since build's version.
      return new DetailedError(
        "invalid_input",
        buildMessages.noNextVersion(problem.version),
        buildMessages.noNextVersionFix(),
      );
    case "snapshot":
      return new DetailedError(
        "invalid_input",
        buildMessages.toolProblems(problem.problems.length),
        buildMessages.workspaceErrorsFix(),
        {},
        {
          lines: problem.problems.map(
            (each) => buildMessages.toolProblem(each.path.join("."), each.message).phrase,
          ),
          fix: buildMessages.workspaceErrorsFix(),
        },
      );
    case "action-unavailable":
      return new DetailedError(
        "invalid_input",
        buildMessages.actionUnavailable(
          problem.tools.map((each) => each.tool),
          [...new Set(problem.tools.map((each) => each.action))],
        ),
        buildMessages.actionUnavailableFix(problem.tools.map((each) => each.tool)),
        { tools: problem.tools },
      );
    case "previous-build":
    case "other-plugin":
      return previousBuildRefusal(problem, since);
  }
}

function textOption(input: CommandInput, name: string): string | undefined {
  const value = input.options[name];
  return typeof value === "string" ? value : undefined;
}
