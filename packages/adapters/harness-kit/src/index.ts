// The public API of @halonicjs/adapter-harness-kit. Everything else in src/ is internal.

export {
  allowedCodingTools,
  askingCodingTools,
  type CodingToolsChoice,
  type CodingToolsCommand,
  type CodingToolsRunFolders,
  codingToolsCommand,
  codingToolsServerName,
  readOnlyCodingTools,
} from "./coding-tools-server.ts";
export { homeDeniedGroups, homeDeniedPaths } from "./denied-groups.ts";
export { exitGraceMs, exitWithin, stopUnlessExited } from "./exit-within.ts";
export { HarnessEventFilter, type HarnessEventFilterOptions } from "./harness-event-filter.ts";
export {
  type HarnessAgentFile,
  type HarnessProfileHost,
  HarnessProfiles,
  type HarnessProfilesOptions,
} from "./harness-profiles.ts";
export {
  type HarnessInstall,
  type RealPath,
  realPathOnDisk,
  type WindowsUserFolders,
  windowsInstallReadPaths,
} from "./install-folders.ts";
export {
  copyInstructions,
  describeInstructionPin,
  type InstructionDisk,
  type InstructionFile,
  type InstructionSnapshot,
  instructionDiskOnThisComputer,
  pinInstructions,
  snapshotInstructions,
} from "./instruction-snapshot.ts";
export { outputTail } from "./output-tail.ts";
export {
  bwrapCheckArgs,
  type OwnSandboxCheck,
  type OwnSandboxCheckOptions,
  ownSandboxCheck,
} from "./own-sandbox.ts";
export {
  type HarnessSettingsFolders,
  type ProfileHostDisk,
  profileHostDiskOnThisComputer,
  WorkspaceHarnessHost,
  type WorkspaceHarnessHostOptions,
} from "./profile-host.ts";
export { programEnvironment } from "./program-environment.ts";
export { type ReadLinesOptions, readLines } from "./read-lines.ts";
export { type ResolvedRealPath, resolveRealPath } from "./real-path.ts";
export {
  instructionFilesOf,
  RunInstructions,
  type RunInstructionsOptions,
} from "./run-instructions.ts";
export type {
  SettingsFileOptions,
  SettingsFolderContents,
  SettingsFolderWriter,
} from "./settings-files.ts";
export { diskSettingsFolder, resetSettingsFolder, writeSettingsFiles } from "./settings-folder.ts";
export {
  isInsideOrSame,
  type ProfileDisk,
  profileDiskOnThisComputer,
} from "./working-folder.ts";
