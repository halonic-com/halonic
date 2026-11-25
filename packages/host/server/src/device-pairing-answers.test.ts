import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { password, setup } from "./device-pairing.test-helper.ts";

const minuteMs = 60 * 1000;
const dayMs = 24 * 60 * minuteMs;

/** A server with one request waiting for Allow, and the calls a device and the owner make on it. */
async function waitingRequest() {
  const server = setup();
  const cookie = await server.browserCookie();
  const code = await server.newCode({ cookie });
  const pending = await server.send("/api/pair", { body: { code, deviceName: "Laptop" } });
  const [waiting] = (await server.send("/api/devices", { cookie })).json.waiting ?? [];
  const byDevice = { body: { pendingId: pending.json.pendingId } };
  const byOwner = { cookie, body: { password, requestId: waiting?.id } };
  return {
    ...server,
    cookie,
    code,
    pending,
    poll: () => server.send("/api/pair/status", byDevice),
    cancel: () => server.send("/api/pair/cancel", byDevice),
    allow: () => server.send("/api/devices/allow", byOwner),
    deny: () => server.send("/api/devices/deny", byOwner),
  };
}

describe("what a device hears about its pairing request", () => {
  verifies("server.device-pairing-answers", () => {
    it("answers when the code ends with the pending ID, and the session's 90-day end with the token", async () => {
      const { clock, pending, poll, allow } = await waitingRequest();
      const now = clock.now().getTime();
      expect(Date.parse(pending.json.expiresAt ?? "")).toBe(now + 10 * minuteMs);
      expect(await poll()).toMatchObject({ status: 202, json: { state: "waiting" } });
      expect((await allow()).status).toBe(204);
      const done = await poll();
      expect(done.json.state).toBe("allowed");
      expect(Date.parse(done.json.sessionEndsAt ?? "")).toBe(now + 90 * dayMs);
    });

    it("answers cancelled after the device cancels, and refuses Allow and the code after it", async () => {
      const { send, code, poll, cancel, allow } = await waitingRequest();
      expect((await cancel()).status).toBe(204);
      expect(await poll()).toMatchObject({ status: 200, json: { state: "cancelled" } });
      expect((await allow()).status).toBe(404);
      expect((await cancel()).status).toBe(404);
      const again = await send("/api/pair", { body: { code, deviceName: "Laptop" } });
      expect(again.status).toBe(401);
    });

    it("starts no session when the device cancels after Allow but before it collects the token", async () => {
      const { send, cookie, poll, cancel, allow } = await waitingRequest();
      expect((await allow()).status).toBe(204);
      expect((await cancel()).status).toBe(204);
      expect((await poll()).json).toEqual({ state: "cancelled" });
      expect((await send("/api/devices", { cookie })).json.devices).toEqual([]);
    });

    it("answers expired 10 minutes on, and nothing once the request is no longer kept", async () => {
      const { clock, poll, allow } = await waitingRequest();
      clock.advance(10 * minuteMs);
      expect(await poll()).toMatchObject({ status: 200, json: { state: "expired" } });
      expect((await allow()).status).toBe(404);
      clock.advance(10 * minuteMs);
      expect((await poll()).status).toBe(404);
    });

    it("answers refused after the owner's Deny, and refuses Allow after it", async () => {
      const { send, cookie, poll, deny, allow } = await waitingRequest();
      expect((await deny()).status).toBe(204);
      expect((await send("/api/devices", { cookie })).json.waiting).toEqual([]);
      expect(await poll()).toMatchObject({ status: 200, json: { state: "refused" } });
      expect((await allow()).status).toBe(404);
      expect((await deny()).status).toBe(404);
    });

    it("answers taken over after a second request with the same code, and refuses a third", async () => {
      const { send, code, poll } = await waitingRequest();
      const second = await send("/api/pair", { body: { code, deviceName: "Other" } });
      expect(second.status).toBe(401);
      expect(await poll()).toMatchObject({ status: 200, json: { state: "taken-over" } });
      const third = await send("/api/pair", { body: { code, deviceName: "Third" } });
      expect(third.status).toBe(401);
    });

    it("gives nothing for a guessed pending ID, whether polled or cancelled", async () => {
      const { send } = await waitingRequest();
      const guessed = { body: { pendingId: "ab".repeat(32) } };
      const polled = await send("/api/pair/status", guessed);
      expect(polled).toMatchObject({ status: 404, json: { code: "not_found" } });
      expect(polled.json.state).toBeUndefined();
      expect((await send("/api/pair/cancel", guessed)).status).toBe(404);
    });
  });
});

describe("a device ending its own pairing", () => {
  verifies("server.device-pairing-answers", () => {
    it("ends only its own session with its own token; the other device stays signed in", async () => {
      const { send, browserCookie, pairDevice, isSignedIn } = setup();
      const cookie = await browserCookie();
      const laptop = await pairDevice("Laptop", { cookie });
      const desktop = await pairDevice("Desktop", { cookie });
      expect((await send("/api/devices/sign-out", { auth: laptop, body: {} })).status).toBe(204);
      expect(await isSignedIn(laptop)).toBe(false);
      expect(await isSignedIn(desktop)).toBe(true);
    });

    it("refuses a password session, and a device token sent as a cookie", async () => {
      const { send, browserCookie, pairDevice, isSignedIn } = setup();
      const cookie = await browserCookie();
      const auth = await pairDevice("Laptop", { cookie });
      const asBrowser = await send("/api/devices/sign-out", { cookie, body: {} });
      expect(asBrowser).toMatchObject({ status: 403, json: { code: "not_a_device" } });
      const asCookie = `__Host-halonic-session=${auth.slice("Bearer ".length)}`;
      expect((await send("/api/devices/sign-out", { cookie: asCookie, body: {} })).status).toBe(
        401,
      );
      expect(await isSignedIn(auth)).toBe(true);
    });
  });
});

describe("telling a Halonic server from anything else", () => {
  verifies("server.device-pairing-answers", () => {
    it("names the product in /api/hello and nothing about devices or requests", async () => {
      const { send, pending, cookie, pairDevice } = await waitingRequest();
      await pairDevice("Desktop", { cookie });
      const hello = await send("/api/hello");
      expect(hello.status).toBe(200);
      expect(hello.json).toMatchObject({ product: "halonic" });
      expect(Object.keys(hello.json ?? {}).sort()).toEqual([
        "minAppVersion",
        "minStudioVersion",
        "mode",
        "product",
        "runExecutorVersion",
        "version",
      ]);
      const text = JSON.stringify(hello.json);
      for (const told of ["Laptop", "Desktop", pending.json.checkCode ?? "-"]) {
        expect(text).not.toContain(told);
      }
    });
  });
});
