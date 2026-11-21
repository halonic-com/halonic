import { type ConnectorTool, ConnectorToolTimeoutError } from "@halonicjs/ports";
import { McpError } from "../protocol/errors.ts";
import { type McpTool, type McpToolResult, toolMetaKeys } from "../protocol/protocol.ts";

/**
 * One of the server's tools as a `ConnectorTool`, exactly as the server
 * wrote it: `risk` and `untrusted` come from its `_meta` and stay absent
 * when the server left them out. The host decides what to trust
 * (`ports.untrusted-tool-listings`), so nothing is fenced here.
 */
export function toConnectorTool(tool: McpTool): ConnectorTool {
  const risk = tool._meta?.[toolMetaKeys.risk];
  const untrusted = tool._meta?.[toolMetaKeys.untrusted];
  return {
    name: tool.name,
    description: tool.description ?? "",
    parameters: tool.inputSchema,
    ...(risk === undefined ? {} : { risk }),
    ...(untrusted === undefined ? {} : { untrusted }),
  };
}

/** A tool's answer as text: its text parts in order, and a note for each part of another kind. */
export function resultText(result: McpToolResult): string {
  return result.content
    .map((part) => (part.type === "text" ? part.text : `[${part.kind} content]`))
    .join("\n");
}

/**
 * The engine's error for a call to `toolName` that the transport gave up on
 * because the server didn't answer in time, so the engine can name the
 * cause (requirement `mcp.tool-call-timeout`); `undefined` for any other
 * error. The transport's error stays its `cause`.
 *
 * @param programStopped - whether the connector stopped its program for it, as a stdio connector does
 */
export function toolTimeoutOf(
  connectorId: string,
  toolName: string,
  error: unknown,
  programStopped: boolean,
): ConnectorToolTimeoutError | undefined {
  if (!(error instanceof McpError) || error.timeoutMs === undefined) return undefined;
  const seconds = error.timeoutMs / 1000;
  const afterwards = programStopped
    ? ", so Halonic stopped its program. The next call starts it again."
    : ".";
  return new ConnectorToolTimeoutError(
    `Connector "${connectorId}"'s tool "${toolName}" didn't answer within ${seconds} seconds${afterwards}`,
    error.timeoutMs,
    { cause: error },
  );
}
