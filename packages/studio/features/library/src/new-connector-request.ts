import type { NewConnectorWay } from "./new-connector-host.ts";

/** What a request to make a connector fills in beforehand. Both are optional: nothing is guessed. */
export interface NewConnectorRequest {
  /** The missing connector's name, as the run banner names it. */
  readonly name?: string;
  /** How it connects, when that is known, such as `google` for a connector of Google tools. */
  readonly way?: NewConnectorWay;
}

/**
 * A request to open New connector, made by the run banner's "Add connector". The banner can ask
 * before the Library is drawn, so the request waits until the Library takes it.
 */
let pending: NewConnectorRequest | undefined;
const listeners = new Set<() => void>();

/** Asks the Library to open New connector with `request` filled in, now or when it is drawn. */
export function requestNewConnector(request: NewConnectorRequest): void {
  pending = request;
  for (const listener of listeners) listener();
}

/**
 * Calls `onRequest` with the waiting request, if there is one, and with each later one; returns
 * the way to stop. A request goes to one listener only.
 */
export function takeNewConnectorRequests(
  onRequest: (request: NewConnectorRequest) => void,
): () => void {
  const take = () => {
    if (pending === undefined) return;
    const request = pending;
    pending = undefined;
    onRequest(request);
  };
  listeners.add(take);
  take();
  return () => listeners.delete(take);
}
