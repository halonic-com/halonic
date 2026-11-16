/**
 * Whether and where the remote gateway listens. It is not a launch argument:
 * only code that calls `run` itself can turn it on, which the shipped
 * executable never does, because the gateway takes no pairing yet (phase B).
 */
export type GatewaySettings =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly port?: number };

/** The setting of every shipped launch: no gateway. */
export const gatewayOff: GatewaySettings = { enabled: false };
