import { SandboxRuntimeConfigSchema } from "@anthropic-ai/sandbox-runtime";
// Not in srt's public index: imported here only to read the Seatbelt profile
// our patch of srt writes. It runs on every system: it only builds the text.
import { wrapCommandWithSandboxMacOS } from "@anthropic-ai/sandbox-runtime/dist/sandbox/macos-sandbox-utils.js";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { buildSrtConfig, keychainMachServices } from "./srt-config.ts";

function profile(keyStore?: SandboxProfile["keyStore"]): SandboxProfile {
  return {
    workingFolder: "/work/acme",
    tempFolder: "/scratch/hs-1",
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 60_000,
    ...(keyStore === undefined ? {} : { keyStore }),
  };
}

/** The Seatbelt profile srt builds for these Mach services to deny, as part of the command it runs. */
function seatbeltProfile(denyMachLookup: string[] | undefined): string {
  return wrapCommandWithSandboxMacOS({
    command: "true",
    needsNetworkRestriction: true,
    readConfig: { denyOnly: [] },
    writeConfig: { allowOnly: ["/scratch/hs-1"], denyWithinAllow: [] },
    ...(denyMachLookup === undefined ? {} : { denyMachLookup }),
  });
}

const deny = (name: string) => `(deny mach-lookup (global-name "${name}"))`;

verifies("sandbox-srt.profile-to-srt-config", () => {
  describe("the OS key store", () => {
    it("denies the Keychain's Mach services when the profile denies the key store", () => {
      const network = buildSrtConfig(profile("denied")).network;
      expect(network.denyMachLookup).toEqual([
        "com.apple.SecurityServer",
        "com.apple.securityd.xpc",
      ]);
    });

    it("denies no Mach service when the profile allows the key store or leaves it out", () => {
      expect(buildSrtConfig(profile("allowed")).network).not.toHaveProperty("denyMachLookup");
      expect(buildSrtConfig(profile()).network).not.toHaveProperty("denyMachLookup");
    });

    it("keeps the denied services through srt's own schema, which drops what it doesn't know", () => {
      const parsed = SandboxRuntimeConfigSchema.parse(buildSrtConfig(profile("denied")));
      expect(parsed.network).toHaveProperty("denyMachLookup", [...keychainMachServices]);
    });

    it("denies them at the end of srt's Seatbelt profile, after srt's own allows of them", () => {
      const text = seatbeltProfile([...keychainMachServices]);
      for (const name of keychainMachServices) {
        const allowed = text.indexOf(`(global-name "${name}")`);
        expect(allowed).toBeGreaterThan(-1);
        expect(text.lastIndexOf(deny(name))).toBeGreaterThan(allowed);
      }
      // Nothing after the denies takes them back: Seatbelt's last matching rule wins.
      const afterDenies = text.slice(text.lastIndexOf(deny("com.apple.securityd.xpc")));
      expect(afterDenies).not.toMatch(/\(allow mach-lookup/);
    });

    it("writes no deny without a service to deny", () => {
      expect(seatbeltProfile(undefined)).not.toContain("(deny mach-lookup");
    });
  });
});
