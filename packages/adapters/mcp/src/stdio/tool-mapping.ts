import type { ConnectorTool } from "@halonicjs/ports";
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
