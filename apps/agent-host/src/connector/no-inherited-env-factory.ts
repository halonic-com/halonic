import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
} from "@halonicjs/ports";

/**
 * Wraps the factory that starts a program on this computer so it refuses a
 * connector that names variables to take from the host's environment.
 *
 * The caller of the connector routes is a page, not the connector's file: on
 * an unfenced start it would otherwise choose which of the host's variables
 * reach its program. The fenced start refuses the same field, so both starts
 * answer alike.
 */
export class NoInheritedEnvFactory implements ConnectorFactory {
  readonly transport: ConnectorFactory["transport"];
  readonly #inner: ConnectorFactory;

  constructor(inner: ConnectorFactory) {
    this.transport = inner.transport;
    this.#inner = inner;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    if (config.transport.kind === "stdio" && (config.transport.inheritEnv ?? []).length > 0) {
      throw new Error(
        `Connector "${config.id}" names variables to take from the host's environment, and the host passes none of them. Set them under env or secretEnv instead.`,
      );
    }
    return this.#inner.create(config, context);
  }
}
