/** What the launcher says about the remote gateway. */
export type GatewaySettings =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly port?: number };

/**
 * The remote gateway's setting from the host's arguments: off unless
 * `--remote-gateway` is there, and then on a free port unless
 * `--remote-gateway-port` names one. Nothing else turns it on.
 *
 * @returns the setting, or the sentence that says what is wrong with the arguments
 */
export function gatewaySettings(args: readonly string[]): GatewaySettings | { error: string } {
  const portAt = args.indexOf("--remote-gateway-port");
  if (!args.includes("--remote-gateway")) {
    return portAt === -1
      ? { enabled: false }
      : { error: "--remote-gateway-port needs --remote-gateway.\n" };
  }
  if (portAt === -1) return { enabled: true };
  const port = Number(args[portAt + 1] ?? "");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { error: "The agent host needs a port from 1 to 65535 after --remote-gateway-port.\n" };
  }
  return { enabled: true, port };
}
