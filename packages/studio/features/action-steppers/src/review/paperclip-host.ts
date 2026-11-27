/**
 * Binds a Paperclip request's `host` to a Paperclip the user connected (`action-steppers.paperclip-host`).
 * A Paperclip stepper opens pages and guides the user on the host its request names, so the review
 * accepts only a host one of the user's own connections has, never one the request brings along
 * (architecture note on HAL-17491, sections 2.4 and 7.6).
 */
import type { StepperDefinition } from "@halonicjs/action-steppers";
import type { InboxActionRequest } from "@halonicjs/ports";

/** A connection as Settings lists it: only the fields the binding reads. */
export interface ConnectedPlace {
  /** The provider's kind; only `paperclip` connections count. */
  readonly provider: string;
  /** The address its sign-in goes to, such as `https://paperclip.acme.example`. */
  readonly address: string;
}

/**
 * The host names of the Paperclips the user connected, in the form a request's `host` takes:
 * `paperclip.acme.example`. An address that doesn't parse names no host.
 */
export function connectedPaperclipHosts(connections: readonly ConnectedPlace[]): string[] {
  const hosts = new Set<string>();
  for (const connection of connections) {
    if (connection.provider !== "paperclip" || !URL.canParse(connection.address)) continue;
    hosts.add(new URL(connection.address).host);
  }
  return [...hosts];
}

/**
 * Why a Paperclip request can't run on the host it names, or `undefined` when it may: a request
 * for another service, or whose definition takes no `host`, isn't bound. With no connections
 * given, no host is one the user connected, so every Paperclip request with a host is refused.
 */
export function paperclipHostRefusal(
  definition: StepperDefinition,
  action: InboxActionRequest,
  connectedHosts: readonly string[],
): string | undefined {
  const host = action.parameters["host"];
  if (definition.service !== "paperclip" || host === undefined) return undefined;
  if (connectedHosts.includes(String(host))) return undefined;
  return `\`${host}\` isn't a Paperclip you connected in Settings › Connections`;
}
