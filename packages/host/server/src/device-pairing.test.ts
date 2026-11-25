import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { deviceSessionsKey } from "./device-sessions.ts";
import { sessionGenerationKey } from "./stored-session.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";
const password = "correct horse";
const dayMs = 24 * 60 * 60 * 1000;

function setup() {
  const clock = new TestClock();
  const coordination = new FakeCoordination(clock);
  const secret = { hash: `hash:${password}` };
  const server = testServer({
    passwordHash: null,
    secrets: { get: async (name) => (name === "serve-password" ? secret.hash : null) },
    clock,
    coordination: coordination as unknown as Coordination,
    passwordHasher: new FakePasswordHasher(),
  });

  async function send(path: string, init: { body?: object; auth?: string; cookie?: string } = {}) {
    const headers = new Headers({ host });
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (init.auth !== undefined) headers.set("authorization", init.auth);
    if (init.cookie !== undefined) headers.set("cookie", init.cookie);
    const request = new Request(`https://${host}${path}`, {
      method: init.body === undefined ? "GET" : "POST",
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const response = await server.handle(request, { clientAddress: "203.0.113.7" });
    return { status: response.status, json: (await response.json().catch(() => null)) as Answer };
  }

  /** A password session's cookie, as the served Studio page has it. */
  async function browserCookie(): Promise<string> {
    const response = await server.handle(
      new Request(`https://${host}/api/login`, {
        method: "POST",
        headers: { host, "content-type": "application/json" },
        body: JSON.stringify({ password }),
      }),
    );
    return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }

  /** A new code, made from a session with the password again. */
  async function newCode(as: { auth?: string; cookie?: string }): Promise<string> {
    const answer = await send("/api/devices/code", { ...as, body: { password } });
    expect(answer.status).toBe(200);
    return answer.json.code ?? "";
  }

  /** Pairs a device all the way, allowed from `as`, and gives its bearer header. */
  async function pairDevice(name: string, as: { auth?: string; cookie?: string }) {
    const code = await newCode(as);
    const pending = await send("/api/pair", { body: { code, deviceName: name } });
    const [waiting] = (await send("/api/devices", as)).json.waiting ?? [];
    await send("/api/devices/allow", { ...as, body: { password, requestId: waiting?.id } });
    const done = await send("/api/pair/status", { body: { pendingId: pending.json.pendingId } });
    return `Bearer ${done.json.token}`;
  }

  async function isSignedIn(auth: string): Promise<boolean> {
    return (await send("/api/session", { auth })).status === 200;
  }

  return { clock, coordination, secret, send, browserCookie, newCode, pairDevice, isSignedIn };
}

interface Answer {
  code?: string;
  pendingId?: string;
  checkCode?: string;
  token?: string;
  devices?: { id: string; name: string; allowedBy: string }[];
  waiting?: { id: string; deviceName: string; checkCode: string }[];
  allowedDevices?: { id: string; name: string }[];
}

describe("pairing a device", () => {
  verifies("server.device-pairing", () => {
    it("refuses a code that was used, and one 10 minutes old", async () => {
      const { clock, send, browserCookie, newCode } = setup();
      const cookie = await browserCookie();
      const used = await newCode({ cookie });
      expect((await send("/api/pair", { body: { code: used, deviceName: "Laptop" } })).status).toBe(
        200,
      );
      const again = await send("/api/pair", { body: { code: used, deviceName: "Laptop" } });
      expect(again).toMatchObject({ status: 401, json: { code: "pairing_code_refused" } });
      const old = await newCode({ cookie });
      clock.advance(10 * 60 * 1000);
      const late = await send("/api/pair", { body: { code: old, deviceName: "Laptop" } });
      expect(late.status).toBe(401);
    });

    it("answers the 11th wrong code with 429", async () => {
      const { send } = setup();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const wrong = await send("/api/pair", {
          body: { code: "2345 6789", deviceName: "Laptop" },
        });
        expect(wrong.status).toBe(401);
      }
      const limited = await send("/api/pair", {
        body: { code: "2345 6789", deviceName: "Laptop" },
      });
      expect(limited.status).toBe(429);
    });

    it("refuses a second request with the same code and cancels the first", async () => {
      const { send, browserCookie, newCode } = setup();
      const cookie = await browserCookie();
      const code = await newCode({ cookie });
      const first = await send("/api/pair", { body: { code, deviceName: "Laptop" } });
      const second = await send("/api/pair", { body: { code, deviceName: "Other" } });
      expect(second.status).toBe(401);
      expect((await send("/api/devices", { cookie })).json.waiting).toEqual([]);
      const poll = await send("/api/pair/status", { body: { pendingId: first.json.pendingId } });
      expect(poll.status).toBe(404);
    });

    it("gives no session until Allow, then the token once, and nothing for a guessed ID", async () => {
      const { coordination, send, browserCookie, newCode, isSignedIn } = setup();
      const cookie = await browserCookie();
      const code = await newCode({ cookie });
      const pending = await send("/api/pair", { body: { code, deviceName: "Laptop" } });
      const status = { body: { pendingId: pending.json.pendingId } };
      expect((await send("/api/pair/status", status)).status).toBe(202);
      expect((await send("/api/devices", { cookie })).json.devices).toEqual([]);
      const [waiting] = (await send("/api/devices", { cookie })).json.waiting ?? [];
      expect(waiting).toMatchObject({ deviceName: "Laptop", checkCode: pending.json.checkCode });
      const allow = { cookie, body: { password, requestId: waiting?.id } };
      expect((await send("/api/devices/allow", allow)).status).toBe(204);
      const done = await send("/api/pair/status", status);
      expect(done.json.token).toMatch(/^[0-9a-f]{64}$/);
      expect((await send("/api/pair/status", status)).status).toBe(404);
      const guessed = { body: { pendingId: "ab".repeat(32) } };
      expect((await send("/api/pair/status", guessed)).status).toBe(404);
      expect(await isSignedIn(`Bearer ${done.json.token}`)).toBe(true);
      // Only the token's hash is stored.
      expect([...coordination.values.values()].join()).not.toContain(done.json.token);
    });

    it("gives no token for a request allowed before a new password or a revoke of every session", async () => {
      for (const change of ["new password", "revoke every session"]) {
        const { coordination, secret, send, browserCookie, newCode } = setup();
        const cookie = await browserCookie();
        const code = await newCode({ cookie });
        const unused = await newCode({ cookie });
        const pending = await send("/api/pair", { body: { code, deviceName: "Laptop" } });
        const [waiting] = (await send("/api/devices", { cookie })).json.waiting ?? [];
        await send("/api/devices/allow", { cookie, body: { password, requestId: waiting?.id } });
        if (change === "new password") secret.hash = "hash:battery staple";
        else coordination.values.set(sessionGenerationKey, "after-revoke");
        const poll = await send("/api/pair/status", {
          body: { pendingId: pending.json.pendingId },
        });
        expect(poll.status, change).toBe(404);
        const late = await send("/api/pair", { body: { code: unused, deviceName: "Other" } });
        expect(late.status, change).toBe(401);
      }
    });

    it("refuses a device name with a control or format character", async () => {
      const { send, browserCookie, newCode } = setup();
      const code = await newCode({ cookie: await browserCookie() });
      // Right-to-left override, zero-width space and a line break, built so no editor hides them.
      const hidden = [0x202e, 0x200b, 0x0a].map((point) => String.fromCodePoint(point));
      for (const deviceName of hidden.map((character) => `Lap${character}top`)) {
        const refused = await send("/api/pair", { body: { code, deviceName } });
        expect(refused.status, JSON.stringify(deviceName)).toBe(400);
      }
    });

    it("refuses Allow and Add a device from a device session without the password", async () => {
      const { send, browserCookie, pairDevice } = setup();
      const auth = await pairDevice("Laptop", { cookie: await browserCookie() });
      const noPassword = await send("/api/devices/code", { auth, body: {} });
      expect(noPassword.status).toBe(400);
      const wrong = await send("/api/devices/code", { auth, body: { password: "guess" } });
      expect(wrong).toMatchObject({ status: 401, json: { code: "wrong_password" } });
      const allow = await send("/api/devices/allow", {
        auth,
        body: { requestId: "ab".repeat(16) },
      });
      expect(allow.status).toBe(400);
    });
  });
});

describe("device sessions", () => {
  verifies("server.device-pairing", () => {
    it("revokes device A and leaves device B signed in, naming the devices A allowed", async () => {
      const { send, browserCookie, pairDevice, isSignedIn } = setup();
      const a = await pairDevice("Laptop", { cookie: await browserCookie() });
      const b = await pairDevice("Desktop", { auth: a });
      const listed = (await send("/api/devices", { auth: b })).json.devices ?? [];
      const [laptop, desktop] = listed;
      expect(desktop?.allowedBy).toBe(laptop?.id);
      const revoked = await send("/api/devices/revoke", {
        auth: b,
        body: { deviceId: laptop?.id },
      });
      expect(revoked.json.allowedDevices).toMatchObject([{ id: desktop?.id, name: "Desktop" }]);
      expect(await isSignedIn(a)).toBe(false);
      expect(await isSignedIn(b)).toBe(true);
    });

    it("refuses a device token sent as a cookie", async () => {
      const { send, browserCookie, pairDevice } = setup();
      const token = (await pairDevice("Laptop", { cookie: await browserCookie() })).slice(7);
      const asCookie = await send("/api/session", { cookie: `__Host-halonic-session=${token}` });
      expect(asCookie.status).toBe(401);
    });

    it("ends a session unused for 31 days, and one 91 days old even with daily use", async () => {
      const { clock, browserCookie, pairDevice, isSignedIn } = setup();
      const cookie = await browserCookie();
      const idle = await pairDevice("Idle", { cookie });
      const busy = await pairDevice("Busy", { cookie });
      clock.advance(29 * dayMs);
      expect(await isSignedIn(busy)).toBe(true);
      clock.advance(2 * dayMs);
      expect(await isSignedIn(idle)).toBe(false);
      for (let day = 31; day < 89; day += 1) {
        clock.advance(dayMs);
        expect(await isSignedIn(busy)).toBe(true);
      }
      clock.advance(2 * dayMs);
      expect(await isSignedIn(busy)).toBe(false);
    });

    it("lets a request through when its last-seen write keeps losing to other writers", async () => {
      const { clock, coordination, browserCookie, pairDevice, isSignedIn } = setup();
      const auth = await pairDevice("Laptop", { cookie: await browserCookie() });
      clock.advance(2 * 60 * 60 * 1000);
      const compareAndSet = coordination.compareAndSet.bind(coordination);
      coordination.compareAndSet = async (key, expected, next) =>
        key === deviceSessionsKey ? false : compareAndSet(key, expected, next);
      expect(await isSignedIn(auth)).toBe(true);
    });

    it("ends every device session when a new password is set", async () => {
      const { secret, browserCookie, pairDevice, isSignedIn } = setup();
      const auth = await pairDevice("Laptop", { cookie: await browserCookie() });
      secret.hash = "hash:battery staple";
      expect(await isSignedIn(auth)).toBe(false);
    });

    it("counts a record of an unknown version as signed out, and keeps answering", async () => {
      const { coordination, send, browserCookie, pairDevice, isSignedIn } = setup();
      const cookie = await browserCookie();
      const auth = await pairDevice("Laptop", { cookie });
      coordination.values.set(deviceSessionsKey, JSON.stringify({ version: 2, devices: [] }));
      expect(await isSignedIn(auth)).toBe(false);
      expect((await send("/api/devices", { cookie })).status).toBe(200);
    });
  });
});
