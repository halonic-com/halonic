import {
  McpToolServer,
  type McpToolSet,
  supportedMcpVersions,
} from "@halonicjs/adapter-mcp/server";
import type { HarnessBridgeOptions } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { HalonicTools } from "./halonic-tools.ts";
import { PermissionPromptTool } from "./permission-prompt.ts";
import type { BridgeRequestContext, BridgeRoute } from "./route.ts";

/** Where the program reaches Halonic's tools. */
export const mcpPath = "/mcp";

/** Where Claude Code reaches `approve_permission`, its `--permission-prompt-tool`. */
export const permissionPromptPath = "/mcp/permission-prompt";

/** The header a client sends its MCP version in once it has initialized. */
const versionHeader = "mcp-protocol-version";

/**
 * The routes of MCP's streamable HTTP transport (requirement
 * `harness-bridge.mcp`), for two MCP servers: Halonic's tools at
 * {@link mcpPath}, and Claude Code's permission prompt at
 * {@link permissionPromptPath}. A `POST` answers one JSON-RPC message with
 * one JSON reply, and a `GET` gets a 405, because the bridge sends nothing
 * the client didn't ask for. The bridge has checked the run token already,
 * so there is no MCP session id to check: the run is the session.
 */
export function mcpRoutes(): BridgeRoute[] {
  return [
    ...mcpServerRoutes(mcpPath, (run) => {
      const { agentId: agent, tools, recorder, approvals } = run;
      return new HalonicTools({ agent, tools, recorder, approvals });
    }),
    ...mcpServerRoutes(permissionPromptPath, (run) => new PermissionPromptTool(run.approvals)),
  ];
}

/** The `POST` and `GET` routes of one MCP server, whose tools come from the run. */
function mcpServerRoutes(
  path: string,
  toolsOf: (run: HarnessBridgeOptions) => McpToolSet,
): BridgeRoute[] {
  return [
    { method: "POST", path, handle: (context) => answerMcpMessage(context, toolsOf(context.run)) },
    { method: "GET", path, handle: refuseEventStream },
  ];
}

async function answerMcpMessage(
  context: BridgeRequestContext,
  tools: McpToolSet,
): Promise<Response> {
  const { request, signal, reportError } = context;
  checkVersionHeader(request.headers.get(versionHeader));
  const server = new McpToolServer(tools, { reportError });
  const reply = await server.answerBytes(await context.readBody(), { signal });
  if (reply === null) {
    // A notification or a response gets no reply (streamable HTTP, "sending messages").
    return new Response(null, { status: 202 });
  }
  return Response.json(reply);
}

/** The bridge offers no stream of its own messages, which MCP answers with 405. */
async function refuseEventStream(): Promise<Response> {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

/**
 * MCP asks a server to refuse with 400 a version it doesn't speak. A request
 * without the header is let in: the first ones, `initialize` among them,
 * come before the version is agreed.
 */
function checkVersionHeader(sent: string | null): void {
  if (sent === null) return;
  if (!supportedMcpVersions.some((version) => version === sent)) {
    throw new KindedError("invalid_input", "The bridge doesn't speak this MCP version.");
  }
}
