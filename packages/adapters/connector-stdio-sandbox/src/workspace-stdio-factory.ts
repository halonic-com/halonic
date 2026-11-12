import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
} from "@halonicjs/ports";

/**
 * The `stdio` connector factory of a host that can sandbox a workspace's
 * connectors (D45). It starts each connector in the sandbox session its
 * context holds, and only where there is none, as before: the connector
 * file's trust line, and no sites to keep.
 *
 * A plugin's local tool never takes the second way: it always goes to the
 * sandboxed factory, which refuses it when the context has no session, so
 * a host that couldn't open one doesn't run a plugin's program on this
 * computer.
 *
 * @example
 * const factory = new WorkspaceStdioConnectorFactory({
 *   sandboxed: new SandboxStdioConnectorFactory(options),
 *   unfenced: new StdioConnectorFactory(unfencedOptions),
 *   isLocalTool: (id) => localTools.has(id),
 * });
 */
export class WorkspaceStdioConnectorFactory implements ConnectorFactory {
  readonly transport = "stdio";
  readonly #sandboxed: ConnectorFactory;
  readonly #unfenced: ConnectorFactory;
  readonly #isLocalTool: (connectorId: string) => boolean;

  constructor(parts: {
    /** Starts a program in the context's sandbox session. */
    readonly sandboxed: ConnectorFactory;
    /** Starts a workspace connector's program on this computer, when the host has no sandbox. */
    readonly unfenced: ConnectorFactory;
    /** Whether the connector is a plugin's local tool. */
    readonly isLocalTool: (connectorId: string) => boolean;
  }) {
    this.#sandboxed = parts.sandboxed;
    this.#unfenced = parts.unfenced;
    this.#isLocalTool = parts.isLocalTool;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    const sandboxed = context.sandbox !== undefined || this.#isLocalTool(config.id);
    return (sandboxed ? this.#sandboxed : this.#unfenced).create(config, context);
  }
}
