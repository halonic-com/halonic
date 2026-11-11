// The public API of @halonicjs/adapter-integration-runner. Internal code imports by relative path.

export { type IntegrationDeclaration, maxFrameBytes } from "./frames.ts";
export {
  type ConnectRunnerOptions,
  connectRunner,
  type RunnerConnection,
} from "./halonic/connect-runner.ts";
export {
  type FolderEntry,
  folderLinkProblems,
  type IntegrationFolderDisk,
  integrationFolderOnThisMachine,
} from "./halonic/integration-folder.ts";
export {
  defaultRunnerLimits,
  type RunnerBlock,
  RunnerCallTimeoutError,
  type RunnerLimits,
  type RunnerStop,
  RunnerStoppedError,
  RunnerToolError,
} from "./halonic/limits.ts";
export {
  type LoadLocalIntegrationOptions,
  type LocalRunnerBridge,
  loadLocalIntegration,
  type StartLocalRunner,
} from "./halonic/local-integration.ts";
export {
  type RunnerDisk,
  type RunnerFiles,
  type RunnerMachine,
  realRunnerPaths,
  runnerProfile,
  socketFolders,
} from "./halonic/runner-profile.ts";
export {
  type StartedRunner,
  type StartRunnerOptions,
  startRunner,
} from "./halonic/start-runner.ts";
export { type BridgeErrorCode, bridgeErrorCodes } from "./request-errors.ts";
export {
  type RunnerHost,
  RunnerProtocolError,
  type ServeRunnerOptions,
  serveRunner,
} from "./runner/serve-runner.ts";
