import {
  type TunnelConfig,
  type TunnelProvider,
  type TunnelStatus,
  tunnelReasons,
  tunnelStates,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { assert, describe, expect, it } from "vitest";

/** What a suite needs from a provider under test. */
export interface TunnelProviderHarness {
  /** The provider, not started yet. */
  provider: TunnelProvider;
  /** A config the provider can start, as the host would build it for its own gateway. */
  config: TunnelConfig;
}

/** Creates a new provider for one test. The suite stops it when the test ends. */
export type MakeTunnelProvider = () => Promise<TunnelProviderHarness>;

const allowedSchemes = ["https:", "wss:", "tcp:"];

const gateway = (host: unknown, port: unknown) => ({ gateway: { host, port } });

/** Configs read from JSON that no provider may start. */
const refusedConfigs: readonly unknown[] = [
  gateway("0.0.0.0", 4100),
  gateway("192.168.1.20", 4100),
  gateway("localhost", 4100),
  gateway("127.0.0.1", 0),
  gateway("127.0.0.1", 65_536),
  gateway("127.0.0.1", "4100"),
  { ...gateway("127.0.0.1", 4100), bridge: { port: 4200 } },
  { gateway: { host: "127.0.0.1", port: 4100, path: "/bridge" } },
  null,
];

/**
 * The contract every {@link TunnelProvider} passes: the fake, the LAN and
 * Tailscale providers (phase C) and Cloudflare (phase E). It needs no
 * network of its own; a real provider is given a harness that starts it
 * against a local stand-in for its service. It checks only what every
 * provider can be made to show on demand: what a provider does when it is
 * driven into `degraded` or `down` is the provider's own test.
 */
export function tunnelProviderContract(name: string, make: MakeTunnelProvider): void {
  verifies("contracts.tunnel-provider", () => {
    describe(`TunnelProvider contract: ${name}`, () => {
      capabilityCases(make);
      startCases(make);
      statusCases(make);
      stopCases(make);
    });
  });
}

/** Runs one test against a new provider and stops the provider afterwards, so nothing leaks into the next test. */
function withProvider(
  make: MakeTunnelProvider,
  body: (harness: TunnelProviderHarness) => Promise<void>,
): () => Promise<void> {
  return async () => {
    const harness = await make();
    try {
      await body(harness);
    } finally {
      await harness.provider.stop();
    }
  };
}

function capabilityCases(make: MakeTunnelProvider): void {
  it(
    "reports its id and whether it is public and encrypts the path",
    withProvider(make, async ({ provider }) => {
      const capabilities = await provider.capabilities();
      expect(capabilities.id).not.toBe("");
      expect(typeof capabilities.public).toBe("boolean");
      expect(typeof capabilities.encryptsPath).toBe("boolean");
    }),
  );
}

function startCases(make: MakeTunnelProvider): void {
  it(
    "gives an https, wss or tcp endpoint that matches its capabilities",
    withProvider(make, async ({ provider, config }) => {
      const capabilities = await provider.capabilities();
      const endpoint = await provider.start(config);
      expect(allowedSchemes).toContain(new URL(endpoint.url).protocol);
      expect(endpoint.providerId).toBe(capabilities.id);
      expect(endpoint.public).toBe(capabilities.public);
    }),
  );

  it(
    "is ready when start resolves",
    withProvider(make, async ({ provider, config }) => {
      await provider.start(config);
      const [current] = await readStatuses(provider, 1);
      expect(current?.state).toBe("ready");
    }),
  );

  it(
    "refuses a config that is not the gateway on loopback, with a RangeError",
    withProvider(make, async ({ provider }) => {
      for (const bad of refusedConfigs) {
        await expect(provider.start(bad as TunnelConfig)).rejects.toThrow(RangeError);
      }
    }),
  );

  it(
    "gives the same endpoint for a second start with the same config",
    withProvider(make, async ({ provider, config }) => {
      const first = await provider.start(config);
      expect(await provider.start(config)).toEqual(first);
    }),
  );

  it(
    "refuses a second start with another config while a tunnel is up, with a RangeError",
    withProvider(make, async ({ provider, config }) => {
      await provider.start(config);
      const other = {
        gateway: { ...config.gateway, port: config.gateway.port === 4100 ? 4101 : 4100 },
      };
      await expect(provider.start(other)).rejects.toThrow(RangeError);
    }),
  );
}

function statusCases(make: MakeTunnelProvider): void {
  it(
    "starts every status stream with the current state, a new stream each call",
    withProvider(make, async ({ provider, config }) => {
      await provider.start(config);
      const [first] = await readStatuses(provider, 1);
      const [second] = await readStatuses(provider, 1);
      expect(first?.state).toBe("ready");
      expect(second).toEqual(first);
      expect(provider.status()).not.toBe(provider.status());
    }),
  );

  it(
    "gives a reason from the list exactly when the state is degraded or down",
    withProvider(make, async ({ provider, config }) => {
      const seen = collectUntilEnd(provider);
      await provider.start(config);
      await provider.stop();
      const statuses = await seen;
      for (const status of statuses) expectWellFormed(status);
      expect(statuses.length).toBeGreaterThan(1);
    }),
  );

  it(
    "never gives the same state and reason twice in a row, and passes through ready",
    withProvider(make, async ({ provider, config }) => {
      const seen = collectUntilEnd(provider);
      await provider.start(config);
      await provider.stop();
      const statuses = await seen;
      statuses.forEach((status, index) => {
        const before = statuses[index - 1];
        if (before !== undefined) expect(describeStatus(status)).not.toBe(describeStatus(before));
      });
      expect(statuses.map((status) => status.state)).toContain("ready");
    }),
  );
}

function stopCases(make: MakeTunnelProvider): void {
  it(
    "reports down with reason stopped on stop, then ends every stream",
    withProvider(make, async ({ provider, config }) => {
      const seen = collectUntilEnd(provider);
      await provider.start(config);
      await provider.stop();
      const last = (await seen).at(-1);
      expect(last).toMatchObject({ state: "down", reason: "stopped" });
    }),
  );

  it(
    "does nothing when stop is called with no tunnel up, any number of times",
    withProvider(make, async ({ provider, config }) => {
      await expect(provider.stop()).resolves.toBeUndefined();
      await provider.start(config);
      await expect(provider.stop()).resolves.toBeUndefined();
      await expect(provider.stop()).resolves.toBeUndefined();
    }),
  );
}

/** Reads the first `count` statuses of a new stream, then leaves it. */
async function readStatuses(provider: TunnelProvider, count: number): Promise<TunnelStatus[]> {
  const statuses: TunnelStatus[] = [];
  if (count === 0) return statuses;
  for await (const status of provider.status()) {
    statuses.push(status);
    if (statuses.length === count) break;
  }
  return statuses;
}

/** Opens a stream now and resolves with everything it gives until the provider ends it. */
async function collectUntilEnd(provider: TunnelProvider): Promise<TunnelStatus[]> {
  const statuses: TunnelStatus[] = [];
  for await (const status of provider.status()) statuses.push(status);
  return statuses;
}

function describeStatus(status: TunnelStatus): string {
  return `${status.state}/${"reason" in status ? status.reason : ""}`;
}

function expectWellFormed(status: TunnelStatus): void {
  expect(tunnelStates).toContain(status.state);
  expect(Number.isNaN(Date.parse(status.at))).toBe(false);
  if (status.state === "degraded" || status.state === "down") {
    expect(tunnelReasons).toContain(status.reason);
    return;
  }
  assert(!("reason" in status), `${status.state} must not have a reason`);
}
