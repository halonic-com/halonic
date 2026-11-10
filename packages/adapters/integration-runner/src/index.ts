// The public API of @halonicjs/adapter-integration-runner. Internal code imports by relative path.

export { maxFrameBytes } from "./frames.ts";
export {
  type ConnectRunnerOptions,
  connectRunner,
  type RunnerConnection,
} from "./halonic/connect-runner.ts";
export {
  defaultRunnerLimits,
  type RunnerBlock,
  RunnerCallTimeoutError,
  type RunnerLimits,
  type RunnerStop,
  RunnerStoppedError,
  RunnerToolError,
} from "./halonic/limits.ts";
export { type BridgeErrorCode, bridgeErrorCodes } from "./request-errors.ts";
export {
  type RunnerHost,
  RunnerProtocolError,
  type ServeRunnerOptions,
  serveRunner,
} from "./runner/serve-runner.ts";
