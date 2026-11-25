import { counted, listInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/**
 * The sentences of `halonic build` and `halonic build paperclip-plugin`
 * (plan HAL-17950): build a workspace's tools into a Paperclip plugin, with
 * its SHA-256 and release file. The command never installs anything. Wording
 * checked by Sofia on HAL-18126.
 */
export const buildMessages = defineMessages("build", {
  summary: () =>
    phrase`Build the workspace into something another app installs, such as a Paperclip plugin`,
  pluginSummary: () =>
    phrase`Build a Paperclip plugin from the workspace's tools, with its SHA-256 and release file`,
  /** What `build paperclip-plugin` does, for line 1's "Couldn't …:". */
  pluginAction: () => phrase`build the plugin`,

  outOption: () =>
    phrase`The folder to write the plugin and its release file to. The current folder by default.`,
  sinceOption: () =>
    phrase`The previous build's release file, to list what changed and choose the next version.`,
  pluginVersionOption: () =>
    phrase`The plugin's version, such as 0.3.0. By default 0.1.0, or with --since the next minor version after that build's, so 0.3.0 becomes 0.4.0.`,
  badVersion: (version: string) =>
    phrase`--plugin-version takes a version such as 0.3.0, and you gave ${version}.`,
  /** The `--since` build's version, or the one after it, isn't a strict `x.y.z`. */
  noNextVersion: (version: string) =>
    phrase`the --since build has version ${version}, and the next version can't be worked out from it.`,
  noNextVersionFix: () => phrase`Give the version with --plugin-version.`,

  /** The heading of a finished build: the plugin, its version and the commit it holds. */
  built: (pluginId: string, version: string, commit: string) =>
    phrase`${markPart("done")} Built ${pluginId} ${version} from commit ${commit}`,
  archiveLabel: () => phrase`Plugin file`,
  releaseLabel: () => phrase`Release file`,
  sha256Label: () => phrase`SHA-256`,
  changesLabel: () => phrase`Changes`,
  noChanges: () => phrase`none`,
  /**
   * What changed since the previous build, or every tool as added without one,
   * then the routing entries (`roles.<role>`, `areas.<area>`) whose agent changed.
   */
  changes: (
    added: readonly string[],
    removed: readonly string[],
    changed: readonly string[],
    routing: readonly string[] = [],
  ) =>
    phrase`${[
      added.length > 0 ? `added ${listInWords(added)}` : "",
      removed.length > 0 ? `removed ${listInWords(removed)}` : "",
      changed.length > 0 ? `changed ${listInWords(changed)}` : "",
      routing.length > 0 ? `routing ${listInWords(routing)}` : "",
    ]
      .filter((part) => part !== "")
      .join(" · ")}`,

  workspaceErrors: (errors: number) =>
    phrase`the workspace has ${counted(errors, "error", "errors")}.`,
  workspaceErrorsFix: () => phrase`Run halonic validate to see what to fix.`,
  notInGit: () =>
    phrase`the workspace isn't in a git repository, so the release file can't name the commit its tools come from.`,
  notInGitFix: () =>
    phrase`Make one and commit: git init && git add . && git commit -m "First version"`,
  noCommit: () => phrase`the workspace has no commit yet.`,
  commitFix: () => phrase`Commit the workspace's files with git, then build again.`,
  uncommitted: (files: readonly string[]) =>
    phrase`${listInWords(files)} ${files.length === 1 ? "has" : "have"} changes that aren't committed.`,
  badPluginId: (id: string) =>
    phrase`the workspace's id ${id} doesn't make a plugin id. A plugin id takes lowercase letters, digits and "-" only.`,
  toolProblems: (count: number) =>
    phrase`the tool files have ${counted(count, "problem", "problems")}.`,
  toolProblem: (path: string, message: string) => phrase`${path}: ${message}`,
  actionUnavailable: (tools: readonly string[], actions: readonly string[]) =>
    phrase`${listInWords(tools)} ${tools.length === 1 ? "uses" : "use"} ${listInWords(actions)}, which a plugin from this version of Halonic can't run yet.`,
  actionUnavailableFix: (tools: readonly string[]) =>
    phrase`Take the ${tools.length === 1 ? "file" : "files"} for ${listInWords(tools)} out of library/tools and commit, then build again.`,
  noRuntime: () => phrase`this copy of Halonic has no built plugin runtime.`,
  noRuntimeFix: () => phrase`Build it: pnpm --filter @halonicjs/target-paperclip-runtime build`,

  noPrevious: (path: string) => phrase`there's no file at ${path}.`,
  previousNotHalonic: (path: string) => phrase`${path} isn't a release file Halonic wrote.`,
  previousFileMissing: (name: string, path: string) =>
    phrase`the plugin file ${name} isn't next to ${path}.`,
  previousChanged: (path: string) =>
    phrase`the plugin file next to ${path} isn't the one it names: its SHA-256 differs.`,
  otherPlugin: (previous: string, pluginId: string) =>
    phrase`the previous build is of ${previous}, not of ${pluginId}.`,
  previousFix: () => phrase`Give the release file of this workspace's last build with --since.`,

  fileExists: (path: string) => phrase`${path} is already there, and it isn't this build.`,
  fileExistsFix: () =>
    phrase`Build with --since and that build's release file, or give another version with --plugin-version.`,
});
