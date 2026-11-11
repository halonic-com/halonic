// One way for every host to connect a workspace's connector: the CLI to
// read a source's tool listing (HAL-4846), and the engine when it puts a
// turn together (HAL-998). Nothing here knows which host it runs in; the
// host's composition root hands in the factories it can serve.

import type { Connector } from "@halonicjs/format";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
} from "@halonicjs/ports";

/** A connector's transport kind, such as `stdio`. */
export type ConnectorKind = ConnectorConfig["transport"]["kind"];

/**
 * The connector factories a host serves, at most one per transport kind,
 * picking the one for each connector by its transport. A host builds it
 * once, in its composition root.
 *
 * @example
 * const factories = new ConnectorFactories([stdioFactory, httpFactory]);
 * const client = factories.create(connectorConfigOf(file.value), { ...context, trust: grant });
 */
export class ConnectorFactories {
  readonly #byKind = new Map<ConnectorKind, ConnectorFactory>();

  /** @throws RangeError when two factories serve the same transport kind */
  constructor(factories: readonly ConnectorFactory[]) {
    for (const factory of factories) {
      // Keeping either would hide a wiring mistake.
      if (this.#byKind.has(factory.transport)) {
        throw new RangeError(`Two connector factories serve ${factory.transport}; give one.`);
      }
      this.#byKind.set(factory.transport, factory);
    }
  }

  /** Whether this host can connect a connector of `kind`. */
  serves(kind: ConnectorKind): boolean {
    return this.#byKind.has(kind);
  }

  /**
   * Creates the client for `config` with the factory for its transport.
   * The factory checks `context.trust` itself, so an untrusted workspace's
   * program never starts (`ports.connector-trust-enforcement`).
   *
   * @throws Error when no factory serves the connector's transport here
   */
  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    const kind = config.transport.kind;
    const factory = this.#byKind.get(kind);
    if (factory === undefined) {
      throw new Error(`Connector "${config.id}" uses ${kind}, which Halonic can't connect here.`);
    }
    return factory.create(config, context);
  }

  /**
   * Reads the tools `config`'s connector lists now, then closes it, also
   * when the listing fails. The tools are as the server wrote them: fence
   * them with `readToolListing` before they reach a model or a person.
   */
  async listTools(
    config: ConnectorConfig,
    context: ConnectorFactoryContext,
  ): Promise<ConnectorTool[]> {
    const client = this.create(config, context);
    try {
      return await client.listTools();
    } finally {
      await client.close();
    }
  }
}

/**
 * A workspace's connector file as the factories take it. A stdio
 * connector gets no `pin`: a pin comes from the trust record, never from
 * the workspace.
 *
 * @example
 * connectorConfigOf({ id: "notes", transport: { http: { url: "https://notes.acme.test/mcp" } }, secret: "notes-token", … });
 * // { id: "notes", transport: { kind: "http", url: "https://notes.acme.test/mcp", headers: {} }, secret: "notes-token", secretEnv: {} }
 */
export function connectorConfigOf(connector: Connector): ConnectorConfig {
  const secret = connector.secret === undefined ? {} : { secret: connector.secret };
  const transport = connector.transport;
  if ("http" in transport) {
    const { url, headers } = transport.http;
    return {
      id: connector.id,
      transport: { kind: "http", url, headers: headers ?? {} },
      ...secret,
      secretEnv: {},
    };
  }
  if ("stdio" in transport) {
    const { command, args, env, secretEnv, inheritEnv, cwd } = transport.stdio;
    return {
      id: connector.id,
      transport: {
        kind: "stdio",
        command,
        args,
        env: env ?? {},
        ...(inheritEnv === undefined ? {} : { inheritEnv: [...inheritEnv] }),
        ...(cwd === undefined ? {} : { cwd }),
      },
      secretEnv: secretEnv ?? {},
    };
  }
  const { account, client } = transport.google;
  return { id: connector.id, transport: { kind: "google", account, client }, secretEnv: {} };
}
