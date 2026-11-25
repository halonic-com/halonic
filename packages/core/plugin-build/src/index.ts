// The public API of @halonicjs/plugin-build. Everything else in src/ is internal.

export {
  type ChangedTool,
  type ChangeList,
  changeList,
  type SignalChanges,
} from "./change-list.ts";
export {
  type ManifestInput,
  manifestApiVersion,
  pluginManifestText,
  pluginPackageJsonText,
  type ToolDeclaration,
  toolDeclarations,
  toolParametersSchema,
} from "./manifest.ts";
export {
  archiveSha256,
  buildPluginArchive,
  type PluginFiles,
  packageFolder,
  pluginFileNames,
  snapshotPath,
  snapshotSha256,
  snapshotText,
} from "./plugin-archive.ts";
export {
  archiveFileName,
  isPluginId,
  type PluginIdProblem,
  pluginIdFor,
  pluginIdPattern,
  pluginIdPrefix,
  releaseFileName,
} from "./plugin-id.ts";
export {
  firstPluginVersion,
  isPluginVersion,
  nextPluginVersion,
  type PluginVersionProblem,
  pluginVersionPattern,
  type VersionChoice,
} from "./plugin-version.ts";
export {
  maxPreviousArchiveBytes,
  maxPreviousSnapshotBytes,
  type PreviousBuild,
  type PreviousBuildFiles,
  type PreviousBuildProblem,
  readPreviousBuild,
} from "./previous-build.ts";
export {
  maxReleaseFileBytes,
  type NewReleaseFile,
  parseReleaseFile,
  type ReleaseFile,
  type ReleaseFileFields,
  type ReleaseFileProblem,
  releaseFileText,
} from "./release-file.ts";
export type { PluginSnapshot, SnapshotSignal, SnapshotTool } from "./snapshot.ts";
export type { TarReadProblem } from "./tar-read.ts";
