// The server entry, @halonicjs/adapter-mcp/server: a set of tools as an MCP
// server, without a transport. The harness bridge serves it over HTTP; a
// command can serve it over stdio. It loads none of the client's code.

export { type RequestId, type RpcMessage, type RpcReply, rpcErrorCodes } from "./json-rpc.ts";
export { McpToolServer, type McpToolServerOptions, supportedMcpVersions } from "./tool-server.ts";
export type { McpTool, McpToolCallResult, McpToolSet } from "./tool-set.ts";
