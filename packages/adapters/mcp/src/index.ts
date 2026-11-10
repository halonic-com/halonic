// The public API of @halonicjs/adapter-mcp. Internal code imports by relative path.

export { McpError, type McpErrorCode } from "./protocol/errors.ts";
export type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  OutgoingMessage,
} from "./protocol/json-rpc.ts";
export {
  type McpContent,
  type McpTool,
  type McpToolResult,
  supportedProtocolVersions,
  toolNamePattern,
} from "./protocol/protocol.ts";
export {
  type ClientInfo,
  McpSession,
  type McpSessionOptions,
  maxToolPages,
  maxTools,
  type ServerAgreement,
} from "./protocol/session.ts";
export type { AbortSignalLike, McpTransport } from "./protocol/transport.ts";
