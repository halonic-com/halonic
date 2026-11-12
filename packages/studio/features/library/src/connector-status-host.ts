import type { ChatTurnRefusal } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { ConnectionState } from "./connection-state.ts";

/** One connector as the status view shows it. */
export interface ConnectorStatus {
  /** The connector's id, the same text a refusal carries as its `source`. */
  readonly id: string;
  /** The name the user knows it by. */
  readonly name: string;
  readonly state: ConnectionState;
  /** One sentence that says why the connector is in this state. Absent when there is nothing to add. */
  readonly reason?: string;
}

/** One refusal and the time it arrived. */
export interface RecordedRefusal {
  readonly refusal: ChatTurnRefusal;
  readonly at: Date;
}

/** The connectors and what they refused. The app provides it. */
export interface ConnectorStatusHost {
  /** Every connector of the open workspace. */
  list(): Promise<readonly ConnectorStatus[]>;
  /** What the engine refused since Halonic started, newest first. Never more than 20 rows per connector. */
  refusals(connectorId: string): Promise<readonly RecordedRefusal[]>;
  /** Calls `listener` whenever a connector's state or refusals may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** The open workspace's connector status. The app provides it for each open workspace. */
export const ConnectorStatusHostService: ServiceKey<ConnectorStatusHost> =
  serviceKey<ConnectorStatusHost>("library.connector-status");
