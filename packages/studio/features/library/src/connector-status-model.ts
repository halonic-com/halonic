import type {
  ConnectorStatus,
  ConnectorStatusHost,
  RecordedRefusal,
} from "./connector-status-host.ts";

/** The most refusals the status shows. */
export const refusalLimit = 20;

/** What the status section shows. */
export interface ConnectorStatusState {
  /** The host answered at least once. Until then the section shows loading, or the error. */
  readonly loaded: boolean;
  /** The last load failed. With `loaded`, what's shown is what the engine said before. */
  readonly error?: unknown;
  /** The connector, once the host listed it; absent when the host doesn't list this id. */
  readonly connector?: ConnectorStatus;
  /** Newest first, never more than {@link refusalLimit}. */
  readonly refusals: readonly RecordedRefusal[];
}

/**
 * One connector's status: its state and refusals as the host last answered, and a refresh
 * whenever the host says something may have changed. The section reads it with
 * `useSyncExternalStore`.
 */
export class ConnectorStatusModel {
  state: ConnectorStatusState = { loaded: false, refusals: [] };
  private readonly listeners = new Set<() => void>();
  private stopHost: (() => void) | undefined;
  private latest = 0;

  private readonly host: ConnectorStatusHost;
  readonly connectorId: string;

  constructor(host: ConnectorStatusHost, connectorId: string) {
    this.host = host;
    this.connectorId = connectorId;
  }

  /** Calls `listener` after each change of `state`; returns the way to stop. The first listener starts watching the host. */
  subscribe(listener: () => void): () => void {
    if (this.listeners.size === 0) {
      this.stopHost = this.host.subscribe(() => void this.refresh());
      void this.refresh();
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopHost?.();
        this.stopHost = undefined;
      }
    };
  }

  /** Asks the host again. A failure keeps what was shown and sets `error`. An older answer never replaces a newer one. */
  async refresh(): Promise<void> {
    const ticket = ++this.latest;
    try {
      const [connectors, refusals] = await Promise.all([
        this.host.list(),
        this.host.refusals(this.connectorId),
      ]);
      if (ticket !== this.latest) return;
      const connector = connectors.find((candidate) => candidate.id === this.connectorId);
      this.state = {
        loaded: true,
        refusals: refusals.slice(0, refusalLimit),
        ...(connector === undefined ? {} : { connector }),
      };
    } catch (error) {
      if (ticket !== this.latest) return;
      this.state = { ...this.state, error };
    }
    for (const listener of [...this.listeners]) listener();
  }
}
