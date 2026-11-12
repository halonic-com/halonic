/** How a connector stands right now. HAL-715's badges and the status view both read it. */
export type ConnectionState =
  | "connected"
  | "needs-sign-in"
  | "needs-new-secret"
  | "api-off"
  | "not-connected";

/** The colour family of a state. It only decorates: the label always carries the meaning. */
export type ConnectionTone = "success" | "warning" | "neutral";

/**
 * What is known about a connector, in terms that fit every connector. A connector
 * that turns its own records into these facts keeps its own details to itself.
 */
export interface ConnectorFacts {
  /** The user set the connector up. */
  readonly configured: boolean;
  /** The user is signed in to the service on this computer. */
  readonly signedIn: boolean;
  /** The service accepts the connector's secret (client secret, token or key). */
  readonly secretValid: boolean;
  /** The service's API is switched on for the connector. */
  readonly apiOn: boolean;
}

/**
 * The one place that decides the state. When several things are wrong it names the one
 * the user must fix first: the secret, then the sign-in, then the API.
 */
export function connectionStateOf(facts: ConnectorFacts): ConnectionState {
  if (!facts.configured) return "not-connected";
  if (!facts.secretValid) return "needs-new-secret";
  if (!facts.signedIn) return "needs-sign-in";
  if (!facts.apiOn) return "api-off";
  return "connected";
}

/** What the user reads for a state, and its tone. The words are HAL-715's. */
export const connectionStateTable: Readonly<
  Record<ConnectionState, { readonly label: string; readonly tone: ConnectionTone }>
> = {
  connected: { label: "Connected", tone: "success" },
  "needs-sign-in": { label: "Needs sign-in", tone: "warning" },
  "needs-new-secret": { label: "Needs new secret", tone: "warning" },
  "api-off": { label: "API off", tone: "warning" },
  "not-connected": { label: "Not connected", tone: "neutral" },
};
