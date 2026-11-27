/**
 * Binds a Paperclip request's `host` to a Paperclip the user connected (`action-steppers.paperclip-host`).
 * A Paperclip stepper opens pages and guides the user on the host its request names, so the review
 * accepts only a host whose connection holds a key on this computer, never one the request brings
 * along (architecture note on HAL-17491, sections 2.4 and 7.6).
 */
import type { StepperDefinition } from "@halonicjs/action-steppers";
import type { InboxActionRequest } from "@halonicjs/ports";

/** A connection as Settings lists it: only the fields the binding reads. */
export interface ConnectedPlace {
  /** The provider's kind; only `paperclip` connections count. */
  readonly provider: string;
  /** The address its sign-in goes to, such as `https://paperclip.acme.example`. */
  readonly address: string;
  /** `online` or `offline` while this computer holds its key; `no-key` or `signed-out` otherwise. */
  readonly state: { readonly kind: string };
}

/** A Paperclip the user connected, by the host a request names. */
export interface ConnectedPaperclip {
  /** Its host, in the form a request's `host` takes: `paperclip.acme.example`. */
  readonly host: string;
  /** Whether this computer holds a key for it that Paperclip hasn't refused. */
  readonly hasKey: boolean;
}

/**
 * The connections as this window has read them: not yet, the Paperclips they list, or a read that
 * failed. Until the first read finishes, a Paperclip request with a host neither runs nor is refused.
 */
export type ConnectionsRead =
  | { readonly kind: "loading" }
  | { readonly kind: "read"; readonly paperclips: readonly ConnectedPaperclip[] }
  | { readonly kind: "failed" };

/** No connections, as in a browser: a Paperclip request with a host runs nowhere. */
export const noConnections: ConnectionsRead = { kind: "read", paperclips: [] };

/**
 * Whether a Paperclip request may run on the host it names: yes, not yet because the connections
 * are still being read, or no and why.
 */
export type HostBinding =
  | { readonly kind: "runs" }
  | { readonly kind: "waits" }
  | { readonly kind: "refused"; readonly reason: string };

/** The row states in which this computer holds the connection's key. */
const keyedStates: ReadonlySet<string> = new Set(["online", "offline"]);

/**
 * The Paperclips the user connected, one per host; a host has a key when any of its connections
 * has one. An address that doesn't parse names no host. `URL.host` keeps a port, so a request
 * for a Paperclip on another port has to name it too, or it matches nothing.
 */
export function connectedPaperclips(connections: readonly ConnectedPlace[]): ConnectedPaperclip[] {
  const hasKeyByHost = new Map<string, boolean>();
  for (const connection of connections) {
    if (connection.provider !== "paperclip" || !URL.canParse(connection.address)) continue;
    const host = new URL(connection.address).host;
    const hasKey = keyedStates.has(connection.state.kind);
    hasKeyByHost.set(host, (hasKeyByHost.get(host) ?? false) || hasKey);
  }
  return [...hasKeyByHost].map(([host, hasKey]) => ({ host, hasKey }));
}

/**
 * Whether a Paperclip request may run on the host it names. A request for another service, or whose
 * definition takes no `host`, isn't bound and runs. A host counts only while this computer holds its
 * connection's key, except for a definition with `sign-in` steps, which makes that key. While the
 * connections are still being read the request waits; when the read failed it is refused.
 */
export function bindPaperclipHost(
  definition: StepperDefinition,
  action: InboxActionRequest,
  connections: ConnectionsRead,
): HostBinding {
  const host = action.parameters["host"];
  if (definition.service !== "paperclip" || host === undefined) return { kind: "runs" };
  if (connections.kind === "loading") return { kind: "waits" };
  if (connections.kind === "failed") {
    return refused("Halonic couldn't read your connections in Settings › Connections");
  }
  const paperclip = connections.paperclips.find((connected) => connected.host === String(host));
  if (paperclip === undefined) {
    return refused(`\`${host}\` isn't a Paperclip you connected in Settings › Connections`);
  }
  // A first sign-in needs only the connection file; Studio's sign-in already binds it to that file.
  if (paperclip.hasKey || signsIn(definition)) return { kind: "runs" };
  return refused(
    `this computer isn't signed in to \`${host}\`: sign in to it in Settings › Connections`,
  );
}

function refused(reason: string): HostBinding {
  return { kind: "refused", reason };
}

/** Whether the definition has `sign-in` steps. */
function signsIn(definition: StepperDefinition): boolean {
  return definition.steps.some((step) => step.kind === "sign-in");
}
