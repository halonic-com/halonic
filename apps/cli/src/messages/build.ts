import { counted, listInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/**
 * The sentences of `halonic build` and `halonic build paperclip-plugin`
 * (plan HAL-17950): build a workspace's tools into a Paperclip plugin, with
 * its sha-256 and release file. The command never installs anything.
 */
export const buildMessages = defineMessages("build", {
  summary: () => phrase`Build something from the workspace to install elsewhere`,
  pluginSummary: () =>
    phrase`Build a Paperclip plugin of the workspace's tools, with its sha-256 and release file`,
  /** What `build paperclip-plugin` does, for line 1's "Couldn't …:". */
  pluginAction: () => phrase`build the plugin`,

  outOption: () => phrase`The folder to write the plugin to. The current folder by default.`,
  sinceOption: () =>
    phrase`The previous build's release file, to list what changed and choose the next version.`,
  pluginVersionOption: () =>
    phrase`The plugin's version, such as 0.3.0. By default the previous build's with its minor number raised, or 0.1.0.`,
  badVersion: (version: string) => phrase`${version} isn't a version such as 0.3.0.`,

  /** The heading of a finished build: the plugin, its version and the commit it holds. */
  built: (pluginId: string, version: string, commit: string) =>
    phrase`${markPart("done")} Built ${pluginId} ${version} from commit ${commit}`,
  archiveLabel: () => phrase`Plugin`,
  releaseLabel: () => phrase`Release`,
  sha256Label: () => phrase`sha-256`,
  changesLabel: () => phrase`Changes`,
  noChanges: () => phrase`none`,
  /** What changed since the previous build, or every tool as added without one. */
  changes: (added: readonly string[], removed: readonly string[], changed: readonly string[]) =>
    phrase`${[
      added.length > 0 ? `added ${listInWords(added)}` : "",
      removed.length > 0 ? `removed ${listInWords(removed)}` : "",
      changed.length > 0 ? `changed ${listInWords(changed)}` : "",
    ]
      .filter((part) => part !== "")
      .join("; ")}`,

  workspaceErrors: (errors: number) =>
    phrase`the workspace has ${counted(errors, "error", "errors")}.`,
  workspaceErrorsFix: () => phrase`See what to fix: halonic validate`,
  notInGit: () =>
    phrase`the workspace isn't a git repository, so the release file can't name the commit its tools come from.`,
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
    phrase`this Halonic's plugin runtime can't run ${listInWords(actions)} yet, which ${listInWords(tools)} ${tools.length === 1 ? "uses" : "use"}.`,
  actionUnavailableFix: () =>
    phrase`Leave those tools out of library/tools, or build with a newer Halonic.`,
  noRuntime: () => phrase`this copy of Halonic has no built plugin runtime.`,
  noRuntimeFix: () => phrase`Build it: pnpm --filter @halonicjs/target-paperclip-runtime build`,

  noPrevious: (path: string) => phrase`there's no file at ${path}.`,
  previousNotHalonic: (path: string) =>
    phrase`${path} isn't a release file Halonic wrote, or its archive isn't next to it.`,
  previousChanged: (path: string) =>
    phrase`the archive next to ${path} isn't the one its release file names: its sha-256 differs.`,
  otherPlugin: (previous: string, pluginId: string) =>
    phrase`the previous build is of ${previous}, not of ${pluginId}.`,
  previousFix: () => phrase`Give the release file of this workspace's last build with --since.`,

  archiveExists: (name: string, folder: string) =>
    phrase`${folder} already has a different ${name}.`,
  archiveExistsFix: () =>
    phrase`Build with --since and that build's release file, or give another version with --plugin-version.`,
});
