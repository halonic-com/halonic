// The fake lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its tests run here.
import type { PairingEvent, PairingSession, RemoteState } from "@halonicjs/ports";
import {
  FakeRemoteControl,
  FakeTunnelTime,
  remoteControlContract,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

remoteControlContract("fake", async () => {
  const control = new FakeRemoteControl();
  return {
    control,
    phoneUsesCode: async (_code, phone) => {
      control.phoneUsesCode(phone);
    },
  };
});

/** Lets the queued deliveries and simulated timers run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Collects a pairing's events in the background, so a test can look at them later. */
function watch(session: PairingSession): PairingEvent[] {
  const seen: PairingEvent[] = [];
  void (async () => {
    for await (const event of session.events()) seen.push(event);
  })();
  return seen;
}

/** Collects every state from now on. */
function watchState(control: FakeRemoteControl): RemoteState[] {
  const seen: RemoteState[] = [];
  void (async () => {
    for await (const state of control.state()) seen.push(state);
  })();
  return seen;
}

verifies("contracts.fake-remote-control", () => {
  describe("FakeRemoteControl", () => {
    it("ends a code after 5 minutes, and keeps the pairing open and remote on for a new code", async () => {
      const time = new FakeTunnelTime();
      const control = new FakeRemoteControl({ time });
      const session = await control.startPairing();
      const seen = watch(session);
      time.advance(5 * 60_000 - 1);
      await settle();
      expect(seen.at(-1)?.type).toBe("code");
      time.advance(1);
      await settle();
      expect(seen.at(-1)).toEqual({ type: "code-ended", reason: "code-expired" });
      expect(control.snapshot).toMatchObject({ on: true, pairing: true });
      expect(() => control.phoneUsesCode({ name: "Pixel 8" })).toThrow();
      await session.newCode();
      await settle();
      expect(seen.at(-1)).toMatchObject({ type: "code", qr: "halonic-pair:fake-2" });
    });

    it("gives a new code a life of its own, so the old code's time runs out on nothing", async () => {
      const time = new FakeTunnelTime();
      const control = new FakeRemoteControl({ time });
      const session = await control.startPairing();
      const seen = watch(session);
      time.advance(4 * 60_000);
      await session.newCode();
      time.advance(60_000);
      await settle();
      expect(seen.map((event) => event.type)).toEqual(["code", "code"]);
      control.phoneUsesCode({ name: "Pixel 8" });
      await session.newCode();
      time.advance(2 * 60_000);
      await settle();
      expect(seen.at(-1)).toMatchObject({ type: "code", qr: "halonic-pair:fake-3" });
      time.advance(3 * 60_000);
      await settle();
      expect(seen.at(-1)).toEqual({ type: "code-ended", reason: "code-expired" });
    });

    it("waits 2 minutes for Allow, and a used code no longer runs out", async () => {
      const time = new FakeTunnelTime();
      const control = new FakeRemoteControl({ time });
      const seen = watch(await control.startPairing());
      time.advance(4 * 60_000);
      expect(control.phoneUsesCode({ name: "Pixel 8" })).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
      time.advance(60_000);
      await settle();
      expect(seen.at(-1)?.type).toBe("check");
      time.advance(60_000);
      await settle();
      expect(seen.at(-1)).toEqual({ type: "code-ended", reason: "allow-timed-out" });
    });

    it("counts wrong tries down and ends the code at the fifth", async () => {
      const control = new FakeRemoteControl();
      const seen = watch(await control.startPairing());
      const left = [1, 2, 3, 4, 5].map(() => control.wrongTry());
      await settle();
      expect(left).toEqual([4, 3, 2, 1, 0]);
      expect(seen.at(-1)).toEqual({ type: "code-ended", reason: "too-many-tries" });
      expect(() => control.wrongTry()).toThrow();
      expect(() => control.phoneUsesCode({ name: "Pixel 8" })).toThrow();
    });

    it("ends a pairing with the tunnel's reason when it can't start or goes down", async () => {
      const control = new FakeRemoteControl();
      control.failNextStart("not-installed");
      const first = watch(await control.startPairing());
      await settle();
      expect(first).toEqual([
        { type: "ended", reason: "tunnel-down", tunnelReason: "not-installed" },
      ]);
      expect(control.snapshot.on).toBe(false);

      const second = watch(await control.startPairing());
      control.setTunnel("degraded", "provider-error");
      expect(control.snapshot.pairing).toBe(true);
      control.setTunnel("down", "offline");
      await settle();
      expect(second.at(-1)).toEqual({
        type: "ended",
        reason: "tunnel-down",
        tunnelReason: "offline",
      });
      expect(control.snapshot.tunnel).toMatchObject({ state: "down", reason: "stopped" });
    });

    it("keeps remote on when a pairing it didn't turn on ends, and shows every tunnel state", async () => {
      const control = new FakeRemoteControl({ tunnelProviderId: "tailscale" });
      await control.setRemote(true);
      await control.setRemote(true);
      const session = await control.startPairing();
      await session.close();
      expect(control.snapshot).toMatchObject({ on: true, tunnelProviderId: "tailscale" });
      control.setTunnel("starting");
      expect(control.snapshot.tunnel.state).toBe("starting");
      control.setTunnel("ready");
      control.setTunnel("down", "signed-out");
      expect(control.snapshot.tunnel).toMatchObject({ state: "down", reason: "signed-out" });
      await control.setRemote(false);
      expect(() => control.setTunnel("ready")).toThrow();
    });

    it("lists phones a test adds, and tracks when they connect and leave", async () => {
      const time = new FakeTunnelTime(Date.parse("2026-11-18T10:00:00.000Z"));
      const control = new FakeRemoteControl({ time });
      const states = watchState(control);
      const pixel = control.addPhone({ name: "Pixel 8", lastSeenAt: "2026-11-16T09:00:00.000Z" });
      const pad = control.addPhone({ name: "iPhone", platform: "ios", connected: true });
      expect(pixel).toMatchObject({ platform: "android", connected: false });
      expect(control.addPhone({ name: "Pixel 8" }).name).toBe("Pixel 8 (2)");
      control.phoneConnects(pixel.id);
      time.advance(60_000);
      control.phoneDisconnects(pixel.id);
      control.phoneDisconnects(pixel.id);
      expect(control.snapshot.phones[0]).toMatchObject({
        connected: false,
        lastSeenAt: "2026-11-18T10:01:00.000Z",
      });
      await control.setRemote(true);
      await control.setRemote(false);
      expect(control.snapshot.phones[1]).toMatchObject({ id: pad.id, connected: false });
      expect(() => control.phoneConnects("not-a-phone")).toThrow();
      await control.revokeAll();
      await control.revokeAll();
      await control.setAllowRiskyRemotely(false);
      await settle();
      expect(states.at(-1)?.phones).toEqual([]);
    });

    it("gives a late reader every event, ignores an answer after the end, and offers remote or not", async () => {
      const control = new FakeRemoteControl({ available: false, hostName: "Studio test" });
      await expect(control.setRemote(true)).rejects.toThrow();
      await expect(control.startPairing()).rejects.toThrow();
      await control.setRemote(false);
      control.setAvailable(true);
      const session = await control.startPairing();
      control.phoneUsesCode({ name: "Pixel 8", platform: "ios" });
      await session.allow();
      await session.close();
      await expect(session.allow()).rejects.toThrow();
      await settle();
      const late = watch(session);
      await settle();
      expect(late.map((event) => event.type)).toEqual(["code", "check", "paired"]);
      expect(late[0]).toMatchObject({ hostName: "Studio test" });
      control.setAvailable(false);
      expect(control.snapshot).toMatchObject({ available: false, on: false });
    });

    it("stops a state reader that leaves early from getting more", async () => {
      const control = new FakeRemoteControl();
      for await (const state of control.state()) {
        expect(state.on).toBe(false);
        break;
      }
      await control.setRemote(true);
      expect(control.snapshot.on).toBe(true);
    });
  });
});
