import type { HttpClient } from "@halonicjs/ports";

// Exists only in types: no value carries it, so no code outside a transport
// that checks addresses can make one by accident.
declare const addressChecking: unique symbol;

/**
 * An `HttpClient` that checks addresses itself: on every request and every
 * redirect hop it resolves the name, checks each address against the host's
 * class, and connects only to an address it checked (I5 design, HAL-958
 * section 3.8). A permission sheet names hosts only, so whatever sends an
 * integration's requests must be one of these, or a public name that
 * resolves to this computer would get through.
 *
 * The mark is a type, not a value: a plain `fetch` wrapper doesn't fit where
 * this is asked for. Only an address-checking transport, such as the Node
 * one, says it is one. A test that answers without a network asserts it with
 * `as`, and says why.
 */
export interface AddressCheckingHttpClient extends HttpClient {
  readonly [addressChecking]: true;
}
