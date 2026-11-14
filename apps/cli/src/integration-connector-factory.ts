// The CLI's connector factory for the `integration` transport (HAL-8089): a
// local integration's tools offered to a run like any other connector's. A
// factory's `create` can't wait, but loading an integration starts a runner,
// so the client it hands out loads on its first use and goes on from there.
// Nothing about the runner is known here: the host passes `open`, which does
// the trust check, the start gate and the load (`openLocalIntegration`).

import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
} from "@halonicjs/ports";

/** What opening a local integration is asked for. */
export interface OpenIntegrationRequest {
  /** The connector's id in the workspace, as a hub names it. */
  readonly id: string;
  /** The integration's folder under `integrations/`, as the connector file names it. */
  readonly folder: string;
  readonly context: ConnectorFactoryContext;
}

/**
 * Opens a local integration in the runner and returns its client.
 *
 * @throws when nothing started, such as an untrusted or changed folder or a fence that failed
 */
export type OpenIntegration = (request: OpenIntegrationRequest) => Promise<ConnectorClient>;

/**
 * Serves `integration` connectors. The runner starts at the first call that
 * needs it, never when the run only holds the connector, and stops when the
 * client closes.
 *
 * @example
 * new ConnectorFactories([stdioFactory, httpFactory, new IntegrationConnectorFactory(open)]);
 */
export class IntegrationConnectorFactory implements ConnectorFactory {
  readonly transport = "integration";
  readonly #open: OpenIntegration;

  constructor(open: OpenIntegration) {
    this.#open = open;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    const { transport } = config;
    if (transport.kind !== "integration") {
      throw new Error(`Connector "${config.id}" isn't a local integration.`);
    }
    process.stderr.write(`TEMP-DIAG create ${config.id}\n`);
    return new LazyIntegrationClient(config.id, () =>
      this.#open({ id: config.id, folder: transport.folder, context }),
    );
  }
}

/** A client that opens the integration once it is used, and says which connector failed when it can't. */
class LazyIntegrationClient implements ConnectorClient {
  readonly id: string;
  readonly #open: () => Promise<ConnectorClient>;
  #opened: Promise<ConnectorClient> | undefined;
  #closed = false;

  constructor(id: string, open: () => Promise<ConnectorClient>) {
    this.id = id;
    this.#open = open;
  }

  async listTools(): Promise<ConnectorTool[]> {
    try {
      const tools = await (await this.#client()).listTools();
      process.stderr.write(`TEMP-DIAG listed ${JSON.stringify(tools)}\n`);
      return tools;
    } catch (e) {
      process.stderr.write(`TEMP-DIAG list failed ${String(e)}\n`);
      throw e;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    return await (await this.#client()).callTool(name, args);
  }

  /** Stops the runner if one started. Closing a client that was never used starts nothing. */
  async close(): Promise<void> {
    this.#closed = true;
    const opened = this.#opened;
    this.#opened = undefined;
    // An open that failed started nothing, so it has nothing to close.
    await (await opened?.catch(() => undefined))?.close();
  }

  async #client(): Promise<ConnectorClient> {
    if (this.#closed) {
      throw new Error(`Connector "${this.id}": its connection is closed.`);
    }
    this.#opened ??= this.#open();
    const opening = this.#opened;
    try {
      return await opening;
    } catch (error) {
      // The next call tries again, with the checks again.
      if (this.#opened === opening) this.#opened = undefined;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Connector "${this.id}" didn't start: ${reason}`, { cause: error });
    }
  }
}
