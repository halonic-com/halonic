import { verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { SandboxBridge, SandboxProfile } from "./index.ts";

verifies("ports.sandbox-profile", () => {
  const profile: SandboxProfile = {
    workingFolder: "/data/workspace/files/agents/writer",
    tempFolder: "/data/tmp/run_1",
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 600_000,
  };

  it("makes the bridge say its kind, so an adapter never guesses it from the fields", () => {
    // @ts-expect-error: a host and a port without the kind
    const unnamed: SandboxBridge = { host: "127.0.0.1", port: 4100 };
    // @ts-expect-error: a socket bridge with a port is not a kind
    const mixed: SandboxBridge = { kind: "socket", host: "127.0.0.1", port: 4100 };
    expect([unnamed, mixed]).toHaveLength(2);
  });

  it("takes a bridge that is a name served on a Unix socket", () => {
    const onSocket: SandboxProfile = {
      ...profile,
      network: {
        bridge: {
          kind: "socket",
          name: "bridge.halonic.invalid",
          socketPath: "/data/bridges/r1/bridge.sock",
        },
        allowedSites: [],
      },
    };
    expectTypeOf<Extract<SandboxBridge, { kind: "socket" }>>().toEqualTypeOf<{
      kind: "socket";
      name: string;
      socketPath: string;
    }>();
    expect(onSocket.network.bridge?.kind).toBe("socket");
  });
});
