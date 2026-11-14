// The CLI's connector factory for the `plugin` transport (HAL-8089): a trusted
// plugin's backend, its tools offered to a run like any other connector's. It
// starts the same way a local integration does (`integration-connector-factory`):
// the client opens the backend on its first use, in the runner, and stops it
// when the run ends. `open` does the plugin's trust check, the start gate and
// the load (`openPluginBackend`).

import type {
  OpenPluginBackend,
  OpenPluginBackendRequest,
} from "@halonicjs/adapter-integration-runner";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
} from "@halonicjs/ports";

export type { OpenPluginBackend, OpenPluginBackendRequest };

import { LazyRunnerClient } from "./integration-connector-factory.ts";

/**
 * Serves `plugin` connectors. The runner starts at the first call that needs
 * it, never when the run only holds the connector, and stops when the client
 * closes.
 *
 * @example
 * new ConnectorFactories([stdioFactory, httpFactory, new PluginConnectorFactory(open)]);
 */
export class PluginConnectorFactory implements ConnectorFactory {
  readonly transport = "plugin";
  readonly #open: OpenPluginBackend;

  constructor(open: OpenPluginBackend) {
    this.#open = open;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    const { transport } = config;
    if (transport.kind !== "plugin") {
      throw new Error(`Connector "${config.id}" isn't a plugin's backend.`);
    }
    return new LazyRunnerClient(config.id, () =>
      this.#open({ id: config.id, plugin: transport.id, context }),
    );
  }
}
