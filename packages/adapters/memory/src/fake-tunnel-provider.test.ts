// The fake lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its tests run here.
import type { TunnelConfig, TunnelStatus } from "@halonicjs/ports";
import {
  FakeTunnelProvider,
  FakeTunnelTime,
  tunnelProviderContract,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

const config: TunnelConfig = { gateway: { host: "127.0.0.1", port: 4100 } };

tunnelProviderContract("fake", async () => ({ provider: new FakeTunnelProvider(), config }));

/** Collects what a stream gives from now on, in the background, so a test can look at it later. */
function watch(provider: FakeTunnelProvider): { seen: TunnelStatus[] } {
  const watched = { seen: [] as TunnelStatus[] };
  void (async () => {
    for await (const status of provider.status()) watched.seen.push(status);
  })();
  return watched;
}

/** Lets the queued status deliveries run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

const states = (watched: { seen: TunnelStatus[] }) =>
  watched.seen.map((status) => `${status.state}${"reason" in status ? `/${status.reason}` : ""}`);

verifies("contracts.fake-tunnel-provider", () => {
  describe("FakeTunnelProvider", () => {
    it("drops with a reason, degrades, and recovers, telling every open stream", async () => {
      const provider = new FakeTunnelProvider();
      await provider.start(config);
      const first = watch(provider);
      const second = watch(provider);
      provider.drop("offline");
      provider.degrade("provider-error");
      provider.recover();
      await settle();
      const expected = ["ready", "down/offline", "degraded/provider-error", "ready"];
      expect(states(first)).toEqual(expected);
      expect(states(second)).toEqual(expected);
    });

    it("reconnects through starting to ready with the same endpoint", async () => {
      const provider = new FakeTunnelProvider();
      const endpoint = await provider.start(config);
      provider.drop("offline");
      const watched = watch(provider);
      expect(await provider.reconnect()).toEqual(endpoint);
      await settle();
      expect(states(watched)).toEqual(["down/offline", "starting", "ready"]);
    });

    it("starts again after a drop, as a reconnect", async () => {
      const provider = new FakeTunnelProvider();
      const endpoint = await provider.start(config);
      provider.drop("offline");
      expect(await provider.start(config)).toEqual(endpoint);
    });

    it("stays starting for its latency, in simulated time only", async () => {
      const time = new FakeTunnelTime();
      const provider = new FakeTunnelProvider({ time, latencyMs: 500 });
      const watched = watch(provider);
      const started = provider.start(config);
      let resolved = false;
      void started.then(() => {
        resolved = true;
      });
      time.advance(499);
      await settle();
      expect(resolved).toBe(false);
      expect(states(watched)).toEqual(["down/stopped", "starting"]);
      time.advance(1);
      await started;
      await settle();
      expect(states(watched)).toEqual(["down/stopped", "starting", "ready"]);
    });

    it("stamps each status with the simulated time", async () => {
      const time = new FakeTunnelTime(Date.parse("2026-11-16T09:00:00.000Z"));
      const provider = new FakeTunnelProvider({ time });
      await provider.start(config);
      time.advance(60_000);
      provider.drop("offline");
      expect(await currentStatus(provider)).toEqual({
        state: "down",
        reason: "offline",
        at: "2026-11-16T09:01:00.000Z",
      });
    });

    it("ends down with the reason when told to fail its next start, once", async () => {
      const provider = new FakeTunnelProvider();
      provider.failNextStart("signed-out");
      await expect(provider.start(config)).rejects.toThrow("signed-out");
      expect(await currentStatus(provider)).toMatchObject({ state: "down", reason: "signed-out" });
      await expect(provider.start(config)).resolves.toMatchObject({ providerId: "fake" });
    });

    it("rejects a start that is stopped before its latency ends", async () => {
      const time = new FakeTunnelTime();
      const provider = new FakeTunnelProvider({ time, latencyMs: 100 });
      const started = provider.start(config);
      const rejected = expect(started).rejects.toThrow("before it was ready");
      await provider.stop();
      time.advance(100);
      await rejected;
      expect(await currentStatus(provider)).toMatchObject({ state: "down", reason: "stopped" });
    });

    it("shares one start between callers while it is starting", async () => {
      const time = new FakeTunnelTime();
      const provider = new FakeTunnelProvider({ time, latencyMs: 10 });
      const first = provider.start(config);
      const second = provider.start(config);
      time.advance(10);
      expect(await second).toEqual(await first);
    });

    it("reports what it was told to, and an endpoint that can never resolve", async () => {
      const provider = new FakeTunnelProvider({
        id: "fake-public",
        public: true,
        encryptsPath: false,
      });
      expect(await provider.capabilities()).toEqual({
        id: "fake-public",
        public: true,
        encryptsPath: false,
      });
      const endpoint = await provider.start(config);
      expect(new URL(endpoint.url).hostname.endsWith(".invalid")).toBe(true);
      expect(endpoint).toMatchObject({ providerId: "fake-public", public: true });
    });

    it("refuses to be driven when no tunnel is up", () => {
      const provider = new FakeTunnelProvider();
      expect(() => provider.drop()).toThrow("no tunnel is up");
      expect(() => provider.degrade()).toThrow("no tunnel is up");
      expect(() => provider.recover()).toThrow("no tunnel is up");
      expect(() => provider.reconnect()).toThrow("no tunnel is up");
    });

    it("stops delivering to a reader that left", async () => {
      const provider = new FakeTunnelProvider();
      await provider.start(config);
      expect((await currentStatus(provider)).state).toBe("ready");
      provider.drop("offline");
      await expect(provider.stop()).resolves.toBeUndefined();
    });
  });
});

/** The first status of a new stream, which is the current one. */
async function currentStatus(provider: FakeTunnelProvider): Promise<TunnelStatus> {
  for await (const status of provider.status()) return status;
  throw new Error("the status stream ended without a status");
}
