// The harness kit's Web-only entry point, for a runtime without Node such as
// the Cloudflare Worker. Everything it exports, and everything it imports,
// uses only Web-standard APIs; `web-imports.test.ts` keeps it that way.
// Path work takes the program's machine's rules as a `HostPaths`.

export {
  askingCodingTools,
  type CodingToolsChoice,
  type CodingToolsCommand,
  codingToolsCommand,
  codingToolsServerName,
  readOnlyCodingTools,
} from "./coding-tools-command.ts";
export { exitGraceMs, exitWithin, stopUnlessExited } from "./exit-within.ts";
export { HarnessEventFilter, type HarnessEventFilterOptions } from "./harness-event-filter.ts";
export type { HostPaths } from "./host-paths.ts";
export { outputTail } from "./output-tail.ts";
export {
  bwrapCheckArgs,
  type OwnSandboxCheck,
  type OwnSandboxCheckOptions,
  ownSandboxCheck,
} from "./own-sandbox.ts";
export { isInsideOrSameOn, isStrictlyInsideOn, overlapsOn } from "./path-containment.ts";
export { programEnvironment } from "./program-environment.ts";
export { type ReadLinesOptions, readLines } from "./read-lines.ts";
export { sessionReadLimitBytes, sessionSettingsFolder } from "./session-settings-folder.ts";
export {
  resetSettingsFolderWith,
  type SettingsFileOptions,
  type SettingsFolderContents,
  type SettingsFolderWriter,
  writeSettingsFilesWith,
} from "./settings-files.ts";
