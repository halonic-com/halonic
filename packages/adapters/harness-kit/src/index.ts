// The public API of @halonicjs/adapter-harness-kit. Everything else in src/ is internal.
export { exitGraceMs, exitWithin } from "./exit-within.ts";
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
export { outputTail } from "./output-tail.ts";
export {
  bwrapCheckArgs,
  type OwnSandboxCheck,
  type OwnSandboxCheckOptions,
  ownSandboxCheck,
} from "./own-sandbox.ts";
export { type ReadLinesOptions, readLines } from "./read-lines.ts";
export {
  diskSettingsFolder,
  type SettingsFolderWriter,
  writeSettingsFiles,
} from "./settings-folder.ts";
export { type ProfileDisk, profileDiskOnThisComputer } from "./working-folder.ts";
