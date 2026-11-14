import {
  AgentHostConnectorFactory,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import type {
  ConnectorConfig,
  ConnectorFactoryContext,
  ConnectorTool,
  HttpClient,
} from "@halonicjs/ports";

/** Reads what one connector's server lists now, started the way a run starts it. */
export type ToolLister = (
  config: ConnectorConfig,
  context: ConnectorFactoryContext,
) => Promise<ConnectorTool[]>;

/**
 * The window's way to start a `stdio` connector: through the agent host, in a sandbox session of
 * its own. Listing and running both go through the factory built here, so a connector is started
 * the same way in both, with the same trust and sandbox rules as `halonic tools review`.
 */
export function agentHostConnectorFactory(
  transport: AgentHostTransport,
): AgentHostConnectorFactory {
  return new AgentHostConnectorFactory(transport);
}

/**
 * A {@link ToolLister} over the agent host. The connector is closed again, whether or not its
 * listing could be read.
 *
 * @example
 * const list = agentHostToolLister(transport);
 * const tools = await list(connectorConfigOf(notes), context);
 */
export function agentHostToolLister(transport: AgentHostTransport): ToolLister {
  const factory = agentHostConnectorFactory(transport);
  return async (config, context) => {
    const connector = factory.create(config, context);
    try {
      return await connector.listTools();
    } finally {
      await connector.close();
    }
  };
}

/**
 * The `http` client a connector's context needs. The window starts no `http` connector yet, so
 * this refuses every request; the library says so before it asks for a listing.
 */
export const noHttpInStudio: HttpClient = {
  fetch: () => Promise.reject(new Error("Studio doesn't connect to http servers yet.")),
};
