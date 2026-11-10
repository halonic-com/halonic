/**
 * The name Claude Code knows the bridge's MCP server by, in the settings
 * folder the harness writes. Claude Code names an MCP tool
 * `mcp__<server>__<tool>`, so Halonic's tools show up as `mcp__halonic__…`.
 */
export const bridgeServerName = "halonic";

/**
 * The name Claude Code knows the bridge's permission prompt server by: a
 * server of its own, at `/mcp/permission-prompt`, with the one tool
 * `approve_permission`, so no other program finds that tool among Halonic's.
 */
export const permissionServerName = "halonic-approvals";

const bridgeToolPrefixes = [bridgeServerName, permissionServerName].map(
  (server) => `mcp__${server}__`,
);

/**
 * Whether Claude Code called this tool through the bridge. The bridge
 * records those calls itself, so the harness doesn't report them again.
 *
 * @example
 * isBridgeTool("mcp__halonic__send_email"); // true
 * isBridgeTool("Bash"); // false
 */
export function isBridgeTool(name: string): boolean {
  return bridgeToolPrefixes.some((prefix) => name.startsWith(prefix));
}
