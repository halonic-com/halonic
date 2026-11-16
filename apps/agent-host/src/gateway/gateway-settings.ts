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

/**
 * The setting the host serves with: over `--stdio` the gateway stays off,
 * because that mode listens on no port (HAL-5396), and the host says why when
 * it was asked for.
 */
export function gatewayFor(
  settings: GatewaySettings,
  overStdio: boolean,
  log: (text: string) => void,
): GatewaySettings {
  if (!overStdio) return settings;
  if (settings.enabled) {
    log(
      "The remote gateway needs a port, and over --stdio the host listens on none: it stays off.\n",
    );
  }
  return gatewayOff;
}
