// A method's `tools` narrows what its agent is offered (HAL-4757): left
// out, the agent's tools as they are; a list, only the tools of those
// names; `[]`, none. Knowledge the engine searches by itself before the
// call isn't a tool the model calls, so a method can't turn it off.

import type { AgentMethod } from "@halonicjs/format";
import type { ConnectorClient } from "@halonicjs/ports";
import type { HalonicTool } from "../agent/turn-tools.ts";

/** Halonic's tools a method's call is offered. */
export function methodHalonicTools(
  tools: readonly HalonicTool[],
  method: AgentMethod | undefined,
): readonly HalonicTool[] {
  const named = namedTools(method);
  return named === undefined ? tools : tools.filter((tool) => named.has(tool.definition.name));
}

/** The connectors a method's call is offered, each with only the tools the method names. */
export function methodConnectors(
  connectors: readonly ConnectorClient[],
  method: AgentMethod | undefined,
): readonly ConnectorClient[] {
  const named = namedTools(method);
  if (named === undefined) return connectors;
  return connectors.map((connector) => ({
    id: connector.id,
    ...(connector.local === undefined ? {} : { local: connector.local }),
    listTools: async () => (await connector.listTools()).filter((tool) => named.has(tool.name)),
    callTool: (name, args, options) => connector.callTool(name, args, options),
    close: () => connector.close(),
  }));
}

function namedTools(method: AgentMethod | undefined): ReadonlySet<string> | undefined {
  return method?.tools === undefined ? undefined : new Set(method.tools);
}
