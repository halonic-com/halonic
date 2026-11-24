import type { TunnelConfig, TunnelReason } from "@halonicjs/ports";

/**
 * The `tailscale` commands the provider runs, and how it reads their
 * answers. Only `status` and `serve` are ever built: never `funnel`, `up`,
 * `login` or `serve reset`, so the provider can't publish the gateway, sign
 * in, or touch serve entries it didn't add.
 */
export const tailscaleCommands = {
  status: () => ["status", "--json"],
  serveStatus: () => ["serve", "status", "--json"],
  serveAdd: (servePort: number, config: TunnelConfig) => [
    "serve",
    "--bg",
    `--https=${servePort}`,
    gatewayTarget(config),
  ],
  serveRemove: (servePort: number) => ["serve", `--https=${servePort}`, "off"],
} as const;

/** The address `tailscale serve` proxies to: the gateway on loopback, over plain HTTP. */
export function gatewayTarget({ gateway }: TunnelConfig): string {
  const host = gateway.host === "::1" ? "[::1]" : gateway.host;
  return `http://${host}:${gateway.port}`;
}

/** The node's tailnet name when it is up and online, or why it isn't usable. */
export type NodeState =
  | { readonly usable: true; readonly dnsName: string }
  | { readonly usable: false; readonly reason: TunnelReason };

const signedOutStates = new Set(["NeedsLogin", "NeedsMachineAuth"]);

/** A tailnet name: dot-separated labels of letters, digits and hyphens, nothing a URL could misread. */
const dnsNamePattern =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Reads `tailscale status --json`: is the node signed in, running and online, and what is its name. */
export function readNodeState(stdout: string): NodeState {
  const status = parseObject(stdout);
  if (status === undefined) return { usable: false, reason: "provider-error" };
  const backend = status["BackendState"];
  if (typeof backend === "string" && signedOutStates.has(backend)) {
    return { usable: false, reason: "signed-out" };
  }
  if (backend !== "Running") return { usable: false, reason: "offline" };
  const self = asObject(status["Self"]);
  if (self === undefined || self["Online"] === false) return { usable: false, reason: "offline" };
  const dnsName = typeof self["DNSName"] === "string" ? self["DNSName"].toLowerCase() : "";
  const trimmed = dnsName.endsWith(".") ? dnsName.slice(0, -1) : dnsName;
  if (!dnsNamePattern.test(trimmed)) return { usable: false, reason: "provider-error" };
  return { usable: true, dnsName: trimmed };
}

/** Whether the serve port is free for the provider, or why it may not use it. */
export type ServePortState =
  | { readonly free: true }
  | { readonly free: false; readonly reason: TunnelReason };

/**
 * Reads `tailscale serve status --json` for one port. Funnel already on for
 * it is `public-refused`: the gateway is never put behind a public name. Any
 * entry of the person's own on that port is `provider-error`, left as it is.
 */
export function readServePort(stdout: string, dnsName: string, servePort: number): ServePortState {
  const config = stdout.trim() === "" ? {} : parseObject(stdout);
  if (config === undefined) return { free: false, reason: "provider-error" };
  const hostPort = `${dnsName}:${servePort}`;
  if (hasKey(config["AllowFunnel"], hostPort)) return { free: false, reason: "public-refused" };
  const taken = hasKey(config["TCP"], String(servePort)) || hasKey(config["Web"], hostPort);
  return taken ? { free: false, reason: "provider-error" } : { free: true };
}

/**
 * Whether the serve config still sends `hostPort` to `target`: the entry
 * the provider added, not one the person put there since. A config that
 * can't be read counts as not ours, so nothing is removed on a guess.
 */
export function servesTarget(stdout: string, hostPort: string, target: string): boolean {
  const config = parseObject(stdout);
  const site = asObject(asObject(config?.["Web"])?.[hostPort]);
  const root = asObject(asObject(site?.["Handlers"])?.["/"]);
  return root?.["Proxy"] === target;
}

/** The endpoint a phone dials: `wss:`, with the port written out only when it isn't 443. */
export function endpointUrl(dnsName: string, servePort: number): string {
  return servePort === 443 ? `wss://${dnsName}` : `wss://${dnsName}:${servePort}`;
}

function hasKey(value: unknown, key: string): boolean {
  const object = asObject(value);
  return object !== undefined && Object.hasOwn(object, key);
}

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    return asObject(JSON.parse(text));
  } catch {
    // Not JSON: the caller reports it as a provider error.
    return undefined;
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
