import { randomUUID } from "node:crypto";
import type { ConnectorClient } from "@halonicjs/ports";
import { OpenLimit } from "../server/open-limit.ts";

/** How many connectors the host keeps open at once. Each may run a sandboxed program. */
export const defaultMaxConnectors = 64;

/**
 * The workspace connectors the host has open, by an id it made. Studio names
 * a connector by that id in later requests; an id the host didn't make finds
 * nothing. A connector starts its program (and its sandbox session) on its
 * first call and stops both when it closes, so closing every connector when
 * the host stops leaves no program running.
 *
 * Once {@link ConnectorTable.closeAll} has started, the host is stopping and
 * the table takes no new connector.
 */
export class ConnectorTable {
  private readonly connectors = new Map<string, ConnectorClient>();
  private readonly openLimit: OpenLimit;
  private stopping = false;

  constructor(options: { maxConnectors?: number } = {}) {
    const max = options.maxConnectors ?? defaultMaxConnectors;
    this.openLimit = new OpenLimit(max, () => this.connectors.size);
  }

  /** True once {@link ConnectorTable.closeAll} has started. */
  get isStopping(): boolean {
    return this.stopping;
  }

  /** Takes a place for a connector about to be added; see `OpenLimit.reserve`. @returns undefined when the table is full */
  reserve(): (() => void) | undefined {
    return this.openLimit.reserve();
  }

  /**
   * Keeps `client` and returns its new id.
   *
   * @returns undefined when the host has started stopping: the caller still owns `client` and closes it
   */
  add(client: ConnectorClient): string | undefined {
    if (this.stopping) return undefined;
    const id = randomUUID();
    this.connectors.set(id, client);
    return id;
  }

  get(id: string): ConnectorClient | undefined {
    return this.connectors.get(id);
  }

  /**
   * Forgets the connector, then closes it. It is forgotten even when it fails to close.
   *
   * @returns false when there is no connector with this id
   * @throws what the connector's own `close` throws
   */
  async close(id: string): Promise<boolean> {
    const client = this.connectors.get(id);
    if (client === undefined) return false;
    this.connectors.delete(id);
    await client.close();
    return true;
  }

  /** Closes every connector, when the host stops. One that fails to close doesn't stop the others. */
  async closeAll(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled([...this.connectors.keys()].map((id) => this.close(id)));
  }
}
