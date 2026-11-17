import type { ChatTurnRefusal, ChatTurnWaiting } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { ConnectionState } from "./connection-state.ts";

/** How a connector reaches its tools, as its file says: names and addresses only, never a secret's value. */
export type ConnectorConnection =
  | { readonly kind: "google"; readonly account: string }
  | { readonly kind: "http"; readonly url: string; readonly secrets: readonly string[] }
  | { readonly kind: "stdio"; readonly command: string; readonly secrets: readonly string[] }
  | { readonly kind: "integration"; readonly folder: string }
  /** `name` is the plugin's display name, when its sheet gives one. */
  | { readonly kind: "plugin"; readonly id: string; readonly name?: string };

/**
 * Which of a connector's tools ask a person first, as its file says, when the New connector dialog
 * wrote it that way: every tool (`every-tool`), or only the Google tools that change or send
 * something (`changes`).
 */
export type ConnectorAsks = "every-tool" | "changes";

/** One connector as the status view shows it. */
export interface ConnectorStatus {
  /** The connector's id, the same text a refusal carries as its `source`. */
  readonly id: string;
  /** The name the user knows it by. */
  readonly name: string;
  readonly state: ConnectionState;
  /** One sentence that says why the connector is in this state. Absent when there is nothing to add. */
  readonly reason?: string;
  /** How the connector connects. Absent when its file can't be read. */
  readonly connection?: ConnectorConnection;
  /** Absent when the file asks in some other way, so the page says nothing about it. */
  readonly asks?: ConnectorAsks;
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
  /**
   * The listed tools of a connector that wait for a person's approval, as the last chat turn
   * left them out. Empty when none waits.
   */
  waiting(connectorId: string): Promise<readonly ChatTurnWaiting[]>;
  /** Calls `listener` whenever a connector's state or refusals may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** The open workspace's connector status. The app provides it for each open workspace. */
export const ConnectorStatusHostService: ServiceKey<ConnectorStatusHost> =
  serviceKey<ConnectorStatusHost>("library.connector-status");
