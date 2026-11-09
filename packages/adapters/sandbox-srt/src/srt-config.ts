import { isIP } from "node:net";
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
 * Builds the sandbox-runtime settings for one session from the profile.
 *
 * The profile's `deniedPaths` become `denyRead` and `denyWrite`. Halonic works
 * out the deny list before the session opens (everything in its data folder
 * except the session's own settings folder), so nothing here has to allow a
 * path inside a denied one. Read-only paths are denied for writing only.
 */
export function buildSrtConfig(profile: SandboxProfile): SandboxRuntimeConfig {
  const writableFolders = [profile.workingFolder, profile.tempFolder];
  if (profile.settingsFolder !== null) {
    writableFolders.push(profile.settingsFolder);
  }
  const { bridge, allowedSites } = profile.network;
  return {
    network: {
      allowedDomains: [bridgeDomain(bridge.host, bridge.port), ...allowedSites],
      deniedDomains: [],
    },
    filesystem: {
      denyRead: profile.deniedPaths.map(literalPath),
      allowWrite: writableFolders.map(literalPath),
      denyWrite: [...profile.deniedPaths, ...profile.readOnlyPaths].map(literalPath),
    },
  };
}
