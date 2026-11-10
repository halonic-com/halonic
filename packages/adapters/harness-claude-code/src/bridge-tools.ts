/**
 * The name Claude Code knows the bridge's MCP server by, in the settings
 * folder the harness writes. Claude Code names an MCP tool
 * `mcp__<server>__<tool>`, so Halonic's tools show up as `mcp__halonic__…`.
 */
export const bridgeServerName = "halonic";

const bridgeToolPrefix = `mcp__${bridgeServerName}__`;

/**
 * Whether Claude Code called this tool through the bridge. The bridge
 * records those calls itself, so the harness doesn't report them again.
 *
 * @example
 * isBridgeTool("mcp__halonic__send_email"); // true
 * isBridgeTool("Bash"); // false
 */
export function isBridgeTool(name: string): boolean {
  return name.startsWith(bridgeToolPrefix);
}
