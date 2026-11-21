import type { ToolFailureCause } from "./run-basics.ts";

/**
 * A connector the agent's file lists couldn't list its tools when a model
 * turn started, so the turn offered none of them and went on without them
 * (requirement `events.connector-listing-failed`). `connector`: its id in
 * the workspace. `cause`: why, as on `tool.result`: `why` is
 * `program-missing` or `secret-not-set` with the program or the secret's
 * `name`, or `plugin-not-trusted` or `plugin-changed` with the plugin's id,
 * when the engine knows, else `other` with no name. It never holds the
 * error's own text.
 */
export interface ConnectorListingFailedEvent {
  type: "connector.listing-failed";
  agent: string;
  connector: string;
  cause: Extract<ToolFailureCause, { code: "connector-not-started" }>;
}
