// Turns a loaded local integration or plugin backend into a `ConnectorClient`,
// so a run's connectors (`RunConnectors` in the engine) can hold it next to an
// `http` or `stdio` one and close it with the same per-run lifecycle. The
// integration's code stays in the runner: this adapter only forwards calls to
// the connection the loader hands out, and closing it stops the runner.

import type { LoadedIntegration } from "@halonicjs/adapter-integration-kit";
import type { ConnectorClient, ConnectorTool, IntegrationConnection } from "@halonicjs/ports";

/** What {@link integrationConnectorClient} needs. */
export interface IntegrationConnectorClientOptions {
  /** The connector's id in the workspace, as a hub names it. */
  readonly id: string;
  /** The integration the loader returned, checked against its permission sheet. */
  readonly loaded: LoadedIntegration;
  /** Whether it runs only on this computer; absent means not local, so `privacy.localOnly` leaves it out. */
  readonly local?: boolean;
}

/**
 * Wraps `loaded` as a connector client. It offers the sheet's tools and no
 * others: a tool the runner lists that the sheet doesn't name is not offered
 * and can't be called. The connection is made on the first use, so a client
 * that is never used connects nothing; once closed, every call fails rather
 * than connect again.
 *
 * @example
 * const loaded = await loadLocalIntegration({ sheet, folder, start, transport, secrets, tokens });
 * if (loaded.ok) clients.push(integrationConnectorClient({ id: "weather", loaded: loaded.value }));
 */
export function integrationConnectorClient(
  options: IntegrationConnectorClientOptions,
): ConnectorClient {
  return new IntegrationConnectorClient(options);
}

class IntegrationConnectorClient implements ConnectorClient {
  readonly id: string;
  readonly local?: boolean;
  readonly #loaded: LoadedIntegration;
  #connection: IntegrationConnection | undefined;
  #closed = false;

  constructor(options: IntegrationConnectorClientOptions) {
    this.id = options.id;
    if (options.local !== undefined) this.local = options.local;
    this.#loaded = options.loaded;
  }

  async listTools(): Promise<ConnectorTool[]> {
    this.#refuseWhenClosed();
    return this.#loaded.integration.tools.map((tool) => ({ ...tool }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    this.#refuseWhenClosed();
    if (!this.#loaded.integration.tools.some((tool) => tool.name === name)) {
      throw new Error(`${this.id}: it offers no tool named "${name}"`);
    }
    return await this.#connect().callTool(name, args);
  }

  async close(): Promise<void> {
    this.#closed = true;
    const connection = this.#connection;
    this.#connection = undefined;
    await connection?.close();
  }

  #connect(): IntegrationConnection {
    this.#connection ??= this.#loaded.integration.connect(this.#loaded.host);
    return this.#connection;
  }

  #refuseWhenClosed(): void {
    if (this.#closed) {
      throw new Error(`${this.id}: its connection is closed`);
    }
  }
}
