// The public API of @halonicjs/adapter-harness-opencode. Everything else in src/ is internal.
export { opencodeCommand } from "./command.ts";
export {
  batchToolCallsLine,
  deniedTools,
  opencodeConfig,
  opencodeInstructionsText,
  opencodeModelCatalog,
  opencodeRunTokenVariable,
  opencodeUpdatePolicyText,
} from "./config.ts";
export { detectOpenCode, opencodeProgram, supportedVersions, testedVersions } from "./detect.ts";
export { disableSwitches, opencodeEnvironment, opencodeStandInKey } from "./environment.ts";
export { type OpenCodeFiles, type OpenCodeFolders, opencodeFiles } from "./files.ts";
export { type OpenCodeStartCheck, opencodeRefusal, supportedPlatforms } from "./refusals.ts";
export { OpenCodeRun, type OpenCodeRunOptions } from "./run.ts";
export { modelTools, OpenCodeEventReader, type OpenCodeEventReaderOptions } from "./run-events.ts";
