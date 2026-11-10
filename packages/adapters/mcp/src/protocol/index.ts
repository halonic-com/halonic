// The protocol entry, @halonicjs/adapter-mcp/protocol: the MCP session over any
// transport. Integrations import only this entry, so they never load the
// stdio launcher or other Node code that the root entry brings in.

export { McpError, type McpErrorCode } from "./errors.ts";
export type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  OutgoingMessage,
} from "./json-rpc.ts";
export {
  type McpContent,
  type McpTool,
  type McpToolResult,
  supportedProtocolVersions,
  toolMetaKeys,
  toolNamePattern,
} from "./protocol.ts";
export {
  type ClientInfo,
  McpSession,
  type McpSessionOptions,
  maxToolPages,
  maxTools,
  type ServerAgreement,
} from "./session.ts";
export type { AbortSignalLike, McpTransport } from "./transport.ts";
