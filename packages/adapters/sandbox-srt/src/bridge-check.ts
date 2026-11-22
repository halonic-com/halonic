import { isIP } from "node:net";
import { isAbsolute } from "node:path";
import { NetworkConfigSchema } from "@anthropic-ai/sandbox-runtime";
import type { SandboxNetwork } from "@halonicjs/ports";
import { bridgeNetwork } from "./srt-config.ts";

/**
 * The longest Unix socket path each system takes, without the closing zero:
 * `sun_path` holds 108 bytes on Linux and 104 on macOS. A longer path fails
 * `listen` (EINVAL on Linux).
 */
export const MAX_SOCKET_PATH_BYTES: Readonly<Partial<Record<NodeJS.Platform, number>>> = {
  linux: 107,
  darwin: 103,
};

/**
 * Refuses a bridge srt can't serve as the only way to Halonic: a loopback
 * address, or a host name on a socket. The name must be one srt accepts in
 * both its allowed list and its `mitmProxy` list, and not one the program
 * dials directly (`localhost` or an address, which srt puts in NO_PROXY).
 */
export function checkBridge(bridge: SandboxNetwork["bridge"], platform: NodeJS.Platform): void {
  if (bridge === null) return;
  if (bridge.kind !== "socket") {
    if (!isLoopback(bridge.host)) {
      throw new Error(`the bridge must be a loopback address, not ${bridge.host}`);
    }
    return;
  }
  const { name, socketPath } = bridge;
  if (!isAbsolute(socketPath)) {
    throw new Error(`the bridge's socket path must be absolute, not ${socketPath}`);
  }
  const bytes = Buffer.byteLength(socketPath);
  const limit = MAX_SOCKET_PATH_BYTES[platform] ?? MAX_SOCKET_PATH_BYTES.darwin ?? 0;
  if (bytes > limit) {
    throw new Error(
      `the bridge's socket path is ${bytes} bytes, more than the ${limit} a Unix socket allows on ${platform}: ${socketPath}`,
    );
  }
  const parsed = NetworkConfigSchema.safeParse({ ...bridgeNetwork(bridge), deniedDomains: [] });
  if (
    name.includes("*") ||
    isLoopback(name) ||
    isIP(name.replace(/^\[|\]$/g, "")) !== 0 ||
    !parsed.success
  ) {
    throw new Error(`the bridge's name must be a plain host name, not ${name}`);
  }
}

/** Whether `host` is `localhost` or a loopback address (`127.0.0.0/8`, `::1`). */
function isLoopback(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  if (bare === "localhost") return true;
  if (isIP(bare) === 4) return bare.startsWith("127.");
  return bare === "::1";
}
