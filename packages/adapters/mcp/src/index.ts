// The public API of @halonicjs/adapter-mcp. Internal code imports by relative path.
// The protocol is also its own entry, `./protocol`, which integrations import instead.

export { McpHttpConnectorFactory, type McpHttpOptions } from "./http/http-connector.ts";
export { defaultHttpLimits, type HttpLimits } from "./http/http-transport.ts";
export { type FoundRunner, findRunner, type RunnerSearch } from "./pinned/find-runner.ts";
export { type LaunchFolders, nodeLaunchFolders } from "./pinned/launch-folders.ts";
export { createRunnerSearch } from "./pinned/node-runner-search.ts";
// The pin check and the pinned launch are shared with
// `@halonicjs/adapter-connector-stdio-sandbox`, so a pinned local tool in a
// sandbox keeps exactly the pin rules of a pinned connector on this computer.
export { checkPinnedLaunch, type PinnedPlace, pinnedLaunch } from "./pinned/pinned-launch.ts";
export {
  type AbortSignalLike,
  type ClientInfo,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpContent,
  McpError,
  type McpErrorCode,
  McpSession,
  type McpSessionOptions,
  type McpTool,
  type McpToolResult,
  type McpTransport,
  maxToolPages,
  maxTools,
  type OutgoingMessage,
  type ServerAgreement,
  supportedProtocolVersions,
  toolMetaKeys,
  toolNamePattern,
} from "./protocol/index.ts";
export { nodeProgramStarter } from "./stdio/node-program-starter.ts";
export type {
  ProgramExit,
  ProgramLaunch,
  ProgramStarter,
  RunningProgram,
} from "./stdio/program.ts";
export {
  defaultRestartLimits,
  RestartLimit,
  type RestartLimits,
} from "./stdio/restart-limit.ts";
export { McpStdioConnectorFactory, type McpStdioOptions } from "./stdio/stdio-connector.ts";
// The transport, restart limit and tool mapping are shared with
// `@halonicjs/adapter-connector-stdio-sandbox`, which starts the program in a
// sandbox session instead of on this computer and speaks the same MCP to it.
export { defaultStdioLimits, type StdioLimits, StdioTransport } from "./stdio/stdio-transport.ts";
export { ConnectorStoppedError } from "./stdio/stopped-error.ts";
export { ConnectorToolError, resultText, toConnectorTool } from "./stdio/tool-mapping.ts";
