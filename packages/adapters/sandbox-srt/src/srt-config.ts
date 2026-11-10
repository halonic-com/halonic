import { isIP } from "node:net";
import { join } from "node:path";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { SandboxProfile } from "@halonicjs/ports";

/** A path the way sandbox-runtime wants a plain path: marked literal, so a `*` in it is never read as a pattern. */
function literalPath(path: string): { path: string; literal: true } {
  return { path, literal: true };
}

/** The bridge as srt wants a host and port: an IPv6 host goes in brackets (`[::1]:4100`). */
function bridgeDomain(host: string, port: number): string {
  return isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`;
}

/**
 * Private and shared address space an allowed site may not resolve to:
 * RFC 1918, carrier-grade NAT and IPv6 unique local addresses. srt itself
 * already refuses a name that resolves to loopback, link-local, cloud metadata
 * or this computer's own addresses; these ranges it leaves to us.
 */
export const DENIED_RESOLVED_ADDRESSES: readonly string[] = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "fc00::/7",
];

/**
 * Files and folders inside the working folder that other tools read as
 * instructions or hooks. The program may write the working folder, but not
 * these, so it can't plant a hook that runs outside the fence later.
 * sandbox-runtime's own write-deny list doesn't cover them.
 */
const toolSettingsInWorkingFolder = [
  join(".claude", "settings.json"),
  join(".claude", "settings.local.json"),
  ".codex",
  ".cursor",
];

/**
 * Builds the sandbox-runtime settings for one session from the profile.
 *
 * The profile's `deniedPaths` become `denyRead` and `denyWrite`. Halonic works
 * out the deny list before the session opens (everything in its data folder
 * except the session's own settings folder), so nothing here has to allow a
 * path inside a denied one. Read-only paths are denied for writing only. The
 * tool settings in the working folder are denied for writing as well.
 *
 * `hiddenPaths` are paths the session adds to hide from the program, such as
 * its own settings and canary folder.
 *
 * Only the bridge and the allowed sites are reachable, and an allowed site is
 * refused when its name resolves to a local or private address (such as
 * `127.0.0.1.nip.io`). The bridge is an address with its port, so a name that
 * resolves to it reaches only the bridge.
 */
export function buildSrtConfig(
  profile: SandboxProfile,
  hiddenPaths: string[] = [],
): SandboxRuntimeConfig {
  const hidden = [...profile.deniedPaths, ...hiddenPaths];
  const toolSettings = toolSettingsInWorkingFolder.map((path) => join(profile.workingFolder, path));
  const writableFolders = [profile.workingFolder, profile.tempFolder];
  if (profile.settingsFolder !== null) {
    writableFolders.push(profile.settingsFolder);
  }
  const { bridge, allowedSites } = profile.network;
  return {
    network: {
      allowedDomains: [bridgeDomain(bridge.host, bridge.port), ...allowedSites],
      deniedDomains: [],
      deniedResolvedAddresses: [...DENIED_RESOLVED_ADDRESSES],
      strictAllowlist: true,
    },
    filesystem: {
      denyRead: hidden.map(literalPath),
      allowWrite: writableFolders.map(literalPath),
      denyWrite: [...hidden, ...profile.readOnlyPaths, ...toolSettings].map(literalPath),
    },
  };
}
