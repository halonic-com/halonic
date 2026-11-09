import { SandboxRuntimeConfigSchema } from "@anthropic-ai/sandbox-runtime";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildSrtConfig } from "./srt-config.ts";

function profile(overrides: Partial<SandboxProfile> = {}): SandboxProfile {
  return {
    workingFolder: "/work/acme",
    tempFolder: "/scratch/hs-1",
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 60_000,
    ...overrides,
  };
}

verifies("sandbox-srt.profile-to-srt-config", () => {
  it("allows writes in the working and temp folders only", () => {
    const writes = buildSrtConfig(profile()).filesystem?.allowWrite;
    expect(writes).toEqual([
      { path: "/work/acme", literal: true },
      { path: "/scratch/hs-1", literal: true },
    ]);
  });

  it("adds the settings folder to the writable folders", () => {
    const writes = buildSrtConfig(profile({ settingsFolder: "/data/agents/ada" })).filesystem
      ?.allowWrite;
    expect(writes).toContainEqual({ path: "/data/agents/ada", literal: true });
  });

  it("passes a denied path with a star as a literal path", () => {
    const config = buildSrtConfig(profile({ deniedPaths: ["/keys/ada*"] }));
    expect(config.filesystem?.denyRead).toEqual([{ path: "/keys/ada*", literal: true }]);
  });

  it("denies read-only paths for writing but not for reading", () => {
    const config = buildSrtConfig(profile({ readOnlyPaths: ["/work/acme/halonic.yaml"] }));
    expect(config.filesystem?.denyRead).toEqual([]);
    expect(config.filesystem?.denyWrite).toEqual([
      { path: "/work/acme/halonic.yaml", literal: true },
    ]);
  });

  it("allows exactly the bridge and the allowed sites on the network", () => {
    const config = buildSrtConfig(
      profile({
        network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: ["*.npmjs.org"] },
      }),
    );
    expect(config.network?.allowedDomains).toEqual(["127.0.0.1:4100", "*.npmjs.org"]);
  });

  it("writes an IPv6 bridge host in brackets", () => {
    const config = buildSrtConfig(
      profile({ network: { bridge: { host: "::1", port: 4100 }, allowedSites: [] } }),
    );
    expect(config.network?.allowedDomains).toEqual(["[::1]:4100"]);
  });

  it("produces settings that srt's own schema accepts", () => {
    const profiles = [
      profile(),
      profile({
        settingsFolder: "/data/agents/ada",
        readOnlyPaths: ["/work/acme/halonic.yaml"],
        deniedPaths: ["/keys/ada*"],
        network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: ["*.npmjs.org"] },
      }),
      profile({ network: { bridge: { host: "::1", port: 4100 }, allowedSites: ["*.npmjs.org"] } }),
    ];
    for (const p of profiles) {
      expect(() => SandboxRuntimeConfigSchema.parse(buildSrtConfig(p))).not.toThrow();
    }
  });
});
