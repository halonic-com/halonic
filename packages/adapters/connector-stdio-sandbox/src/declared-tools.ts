import type { McpTool } from "@halonicjs/adapter-mcp";
import type { ConnectorTool } from "@halonicjs/ports";

/**
 * A tool the plugin's manifest declares for a local tool, with the words
 * and the risk the person saw when they trusted the plugin. A manifest
 * always states `risk` and `untrusted`; they are optional here only as on
 * `ConnectorTool`.
 */
export type DeclaredTool = Pick<ConnectorTool, "name" | "description" | "risk" | "untrusted">;

/**
 * The tools a local tool offers: those the server lists that the manifest
 * declares, each with the manifest's description, `risk` and `untrusted`
 * and the server's parameters. A tool the server lists that the manifest
 * doesn't declare is left out and reported to `onUndeclared` by name. A
 * declared tool the server doesn't list isn't offered: there are no
 * parameters to give the model.
 */
export function offeredTools(
  declared: readonly DeclaredTool[],
  listed: readonly McpTool[],
  onUndeclared: (toolName: string) => void,
): ConnectorTool[] {
  const byName = new Map(declared.map((tool) => [tool.name, tool]));
  const offered: ConnectorTool[] = [];
  for (const tool of listed) {
    const own = byName.get(tool.name);
    if (own === undefined) {
      onUndeclared(tool.name);
      continue;
    }
    offered.push({
      name: own.name,
      description: own.description,
      parameters: tool.inputSchema,
      ...(own.risk === undefined ? {} : { risk: own.risk }),
      ...(own.untrusted === undefined ? {} : { untrusted: own.untrusted }),
    });
  }
  return offered;
}
