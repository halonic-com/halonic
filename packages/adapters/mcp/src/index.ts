// The public API of @halonicjs/adapter-mcp. Internal code imports by relative path.
// The protocol is also its own entry, `./protocol`, which integrations import instead.

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
export { McpStdioConnectorFactory, type McpStdioOptions } from "./stdio/stdio-connector.ts";
export { defaultStdioLimits, type StdioLimits } from "./stdio/stdio-transport.ts";
export { ConnectorToolError } from "./stdio/tool-mapping.ts";
