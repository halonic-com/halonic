// Builds a Paperclip plugin from one workspace commit (plan HAL-17950, with
// Liam's conditions on HAL-17985): the snapshot of its tools, templates
// (HAL-18153), signals (HAL-18365) and routing (HAL-18263), the four fixed files, the archive, its sha-256 and the release
// file. Bytes in, bytes out:
// the caller reads the workspace, the runtime and the previous build, and
// writes what comes back. Nothing here reaches a disk, a network or Paperclip.

import {
  makeSnapshot,
  type Routing,
  type Signal,
  type SnapshotProblem,
  type Template,
  type Tool,
  type WorkspaceSnapshot,
} from "@halonicjs/format";
import {
  archiveFileName,
  archiveSha256,
  buildPluginArchive,
  changeList,
  nextPluginVersion,
  type PluginIdProblem,
  type PluginVersionProblem,
  type PreviousBuild,
  type PreviousBuildFiles,
  type PreviousBuildProblem,
  pluginIdFor,
  pluginManifestText,
  pluginPackageJsonText,
  type ReleaseFile,
  readPreviousBuild,
  releaseFileName,
  releaseFileText,
} from "@halonicjs/plugin-build";
import { err, ok, type Result, type Sha256 } from "@halonicjs/std";

/** One action of the plugin runtime, as the builder needs it. */
export interface RuntimeAction {
  /** The action's name, as a tool file's `action.run` names it. */
  readonly name: string;
  /** Whether the runtime has its code. A tool whose action isn't available is refused. */
  readonly available: boolean;
  /** The Paperclip capabilities it needs beyond the runtime's own. */
  readonly capabilities: readonly string[];
}

/**
 * The plugin runtime this Halonic ships. Its capabilities and settings come
 * from here and never from the workspace, so a workspace can't ask for more
 * than the runtime's reviewed actions need.
 */
export interface PluginRuntime {
  /** The built worker, copied into the plugin byte for byte. */
  readonly worker: Uint8Array;
  readonly actions: readonly RuntimeAction[];
  /** What every plugin needs, whichever actions it uses. */
  readonly capabilities: readonly string[];
  /** The plugin's settings, as JSON Schema properties. */
  readonly settings: Readonly<Record<string, unknown>>;
}

/**
 * The git commit the tool, template and signal files were read at, as the caller found it. The
 * release file names the commit, so it must hold every file the build read.
 */
export type WorkspaceCommit =
  | {
      readonly kind: "commit";
      /** The full commit id. */
      readonly id: string;
      /** The files the build read that differ from the commit or aren't in it, sorted. */
      readonly uncommitted: readonly string[];
    }
  | { readonly kind: "no-repository" }
  | { readonly kind: "no-commit" };

/** What one plugin is built from. */
export interface WorkspacePluginRequest {
  /**
   * The workspace: its id (the plugin id's last part), name, errors, commit,
   * parsed tool, template and signal files and its routing.
   */
  readonly workspace: {
    readonly id: string;
    readonly name: string;
    /** How many errors loading the workspace found. */
    readonly errors: number;
    readonly commit: WorkspaceCommit;
    readonly tools: readonly Tool[];
    /** The templates the plugin serves; none when left out. */
    readonly templates?: readonly Template[];
    /** The signals the plugin switches on; none when left out. */
    readonly signals?: readonly Signal[];
    /** Its `routing.yaml`; left out, the plugin keeps its own defaults. */
    readonly routing?: Routing;
  };
  readonly runtime: PluginRuntime;
  /** The previous build's release file and archive, for the change list and the version. */
  readonly previous?: PreviousBuildFiles;
  /** The version asked for; without it the version follows the previous build. */
  readonly version?: string;
  /** The version of Halonic that builds it. */
  readonly halonicVersion: string;
}

/** A built plugin: the archive and the release file, each with its file name. */
export interface BuiltPlugin {
  readonly archiveName: string;
  readonly archive: Uint8Array;
  readonly releaseName: string;
  readonly releaseText: string;
  readonly release: ReleaseFile;
}

/** A tool whose action the runtime can't run. */
export interface UnavailableTool {
  readonly tool: string;
  readonly action: string;
}

/** Why a plugin wasn't built. Nothing is built in part. */
export type PluginBuildProblem =
  | { readonly code: "workspace-errors"; readonly errors: number }
  | { readonly code: "no-repository" | "no-commit" }
  | { readonly code: "uncommitted"; readonly files: readonly string[] }
  | PluginIdProblem
  | PluginVersionProblem
  | { readonly code: "snapshot"; readonly problems: readonly SnapshotProblem[] }
  | { readonly code: "action-unavailable"; readonly tools: readonly UnavailableTool[] }
  | { readonly code: "previous-build"; readonly problem: PreviousBuildProblem }
  | { readonly code: "other-plugin"; readonly pluginId: string; readonly previousPluginId: string };

/**
 * Builds a workspace's plugin. The same request always gives the same bytes.
 *
 * @param request - the workspace, the runtime and, for `--since`, the previous build
 * @param digest - hashes the archives (the `Digest` port)
 * @returns the archive and release file, or the first problem found
 *
 * @example
 * const built = await buildWorkspacePlugin({ workspace, runtime, halonicVersion: "0.1.0" }, digest);
 * if (built.ok) await write(built.value.archiveName, built.value.archive);
 */
export async function buildWorkspacePlugin(
  request: WorkspacePluginRequest,
  digest: Sha256,
): Promise<Result<BuiltPlugin, PluginBuildProblem>> {
  const { workspace, runtime } = request;
  const checked = checkedWorkspace(workspace, runtime);
  if (!checked.ok) return checked;
  const { pluginId, snapshot } = checked.value;
  const previous = await previousBuild(request.previous, pluginId, digest);
  if (!previous.ok) return previous;
  const version = nextPluginVersion({
    ...(request.version === undefined ? {} : { requested: request.version }),
    ...(previous.value === undefined ? {} : { previous: previous.value.release.version }),
  });
  if (!version.ok) return version;

  const archive = buildPluginArchive({
    packageJson: pluginPackageJsonText(pluginId, version.value),
    manifest: pluginManifestText({
      pluginId,
      version: version.value,
      snapshot,
      capabilities: capabilitiesFor(snapshot.tools, runtime),
      settings: runtime.settings,
    }),
    worker: runtime.worker,
    snapshot,
  });
  const fields = {
    pluginId,
    version: version.value,
    sha256: await archiveSha256(archive, digest),
    workspaceCommit: snapshot.workspace.commit,
    halonicVersion: request.halonicVersion,
    changes: changeList(previous.value?.snapshot, snapshot),
  };
  return ok({
    archiveName: archiveFileName(pluginId, version.value),
    archive,
    releaseName: releaseFileName(pluginId, version.value),
    releaseText: releaseFileText(fields),
    release: { ...fields, archive: archiveFileName(pluginId, version.value) },
  });
}

/**
 * The plugin id and snapshot, once the workspace has no errors, its commit
 * holds every file the build read, and the runtime can run every tool.
 */
function checkedWorkspace(
  workspace: WorkspacePluginRequest["workspace"],
  runtime: PluginRuntime,
): Result<{ pluginId: string; snapshot: WorkspaceSnapshot }, PluginBuildProblem> {
  if (workspace.errors > 0) return err({ code: "workspace-errors", errors: workspace.errors });
  const { commit } = workspace;
  if (commit.kind !== "commit") return err({ code: commit.kind });
  if (commit.uncommitted.length > 0) return err({ code: "uncommitted", files: commit.uncommitted });
  const pluginId = pluginIdFor(workspace.id);
  if (!pluginId.ok) return pluginId;
  const snapshot = makeSnapshot({
    name: workspace.name,
    commit: commit.id,
    tools: workspace.tools,
    ...(workspace.templates === undefined ? {} : { templates: workspace.templates }),
    ...(workspace.signals === undefined ? {} : { signals: workspace.signals }),
    ...(workspace.routing === undefined ? {} : { routing: workspace.routing }),
  });
  if (!snapshot.ok) return err({ code: "snapshot", problems: snapshot.error });
  const unavailable = unavailableTools(snapshot.value.tools, runtime.actions);
  if (unavailable.length > 0) return err({ code: "action-unavailable", tools: unavailable });
  return ok({ pluginId: pluginId.value, snapshot: snapshot.value });
}

/** The tools whose action the runtime doesn't list as available, in the snapshot's order. */
function unavailableTools(
  tools: readonly Tool[],
  actions: readonly RuntimeAction[],
): UnavailableTool[] {
  return tools
    .filter(
      (tool) => !actions.some((action) => action.name === tool.action.run && action.available),
    )
    .map((tool) => ({ tool: tool.name, action: tool.action.run }));
}

/** The runtime's own capabilities and those of each action the tools use. */
function capabilitiesFor(tools: readonly Tool[], runtime: PluginRuntime): string[] {
  const used = new Set<string>(tools.map((tool) => tool.action.run));
  return [
    ...runtime.capabilities,
    ...runtime.actions
      .filter((action) => used.has(action.name))
      .flatMap((action) => action.capabilities),
  ];
}

/** The previous build, read and checked, which must be of the same plugin. */
async function previousBuild(
  files: PreviousBuildFiles | undefined,
  pluginId: string,
  digest: Sha256,
): Promise<Result<PreviousBuild | undefined, PluginBuildProblem>> {
  if (files === undefined) return ok(undefined);
  const previous = await readPreviousBuild(files, digest);
  if (!previous.ok) return err({ code: "previous-build", problem: previous.error });
  const previousPluginId = previous.value.release.pluginId;
  if (previousPluginId !== pluginId) {
    return err({ code: "other-plugin", pluginId, previousPluginId });
  }
  return ok(previous.value);
}
