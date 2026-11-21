/**
 * A step is about to call a connector's program (requirement `events.connector-started`).
 * `connector`: its id in the workspace. `timeoutMs`: how long the engine waits for it; every
 * wait has a limit. Logged before the call, so a screen can say what the step is waiting for.
 */
export interface ConnectorStartedEvent {
  type: "connector.started";
  state: string;
  agent: string;
  connector: string;
  timeoutMs: number;
}
