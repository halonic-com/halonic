import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { createDeviceConsole } from "./device-console.ts";
import { pairingKey } from "./device-pairing.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";
const password = "correct horse";

/** A server and its console over one coordination, as `halonic serve` builds them. */
function setup() {
  const clock = new TestClock();
  const coordination = new FakeCoordination(clock) as unknown as Coordination;
  const secret: { hash: string | null } = { hash: `hash:${password}` };
  const secrets = { get: async (name: string) => (name === "serve-password" ? secret.hash : null) };
  const server = testServer({
    passwordHash: null,
    secrets,
    clock,
    coordination,
    passwordHasher: new FakePasswordHasher(),
  });
  const console = createDeviceConsole({ coordination, clock, secrets });

  async function send(path: string, body?: object, auth?: string) {
    const headers = new Headers({ host });
    if (body !== undefined) headers.set("content-type", "application/json");
    if (auth !== undefined) headers.set("authorization", auth);
    const request = new Request(`https://${host}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const response = await server.handle(request, { clientAddress: "203.0.113.7" });
    return { status: response.status, json: (await response.json().catch(() => null)) as Answer };
  }

  /** Pairs a device with a code from the console, allowed by the console; gives its bearer header. */
  async function pairFromConsole(name: string): Promise<string> {
    const made = (await console.answer({ op: "code" })) as unknown as { code: string };
    const pending = await send("/api/pair", { code: made.code, deviceName: name });
    const waiting = (await console.answer({ op: "waiting", code: made.code })) as unknown as {
      waiting: { id: string }[];
    };
    await console.answer({ op: "allow", requestId: waiting.waiting[0]?.id });
    const collected = await send("/api/pair/status", { pendingId: pending.json.pendingId });
    return `Bearer ${collected.json.token}`;
  }

  return { console, send, secret, coordination, pairFromConsole };
}

interface Answer {
  readonly pendingId?: string;
  readonly checkCode?: string;
  readonly token?: string;
  readonly signedIn?: boolean;
}

describe("device console", () => {
  verifies("server.device-pairing", () => {
    it("makes a code the pair route takes, and allows the request that shows its check code", async () => {
      const { console, send } = setup();
      const made = await console.answer({ op: "code" });
      expect(made).toMatchObject({ ok: true, code: expect.stringMatching(/^[0-9A-Z]{8}$/u) });

      const pending = await send("/api/pair", { code: made["code"], deviceName: "Pixel 9" });
      expect(pending.status).toBe(200);
      const waiting = await console.answer({ op: "waiting", code: made["code"] });
      expect(waiting).toEqual({
        ok: true,
        waiting: [
          expect.objectContaining({ deviceName: "Pixel 9", checkCode: pending.json.checkCode }),
        ],
      });
      const requestId = (waiting as unknown as { waiting: { id: string }[] }).waiting[0]?.id;
      expect(await console.answer({ op: "allow", requestId })).toEqual({ ok: true });

      const first = await send("/api/pair/status", { pendingId: pending.json.pendingId });
      expect(first.json.token).toMatch(/^[0-9a-f]{64}$/u);
      const second = await send("/api/pair/status", { pendingId: pending.json.pendingId });
      expect(second.status).toBe(404);
    });

    it("shows only the request made with its own code, not one waiting on another code", async () => {
      const { console, send } = setup();
      const earlier = (await console.answer({ op: "code" })) as unknown as { code: string };
      await send("/api/pair", { code: earlier.code, deviceName: "Old phone" });
      const made = (await console.answer({ op: "code" })) as unknown as { code: string };
      await send("/api/pair", { code: made.code, deviceName: "New phone" });

      expect(await console.answer({ op: "waiting", code: made.code })).toEqual({
        ok: true,
        waiting: [expect.objectContaining({ deviceName: "New phone" })],
      });
    });

    it("lists a device it allowed as allowed by console", async () => {
      const { console, pairFromConsole } = setup();
      await pairFromConsole("Pixel 9");

      expect(await console.answer({ op: "devices" })).toEqual({
        ok: true,
        devices: [expect.objectContaining({ name: "Pixel 9", allowedBy: "console" })],
      });
    });

    it("revokes one device, leaves the other signed in, and names the devices it allowed", async () => {
      const { console, send, pairFromConsole } = setup();
      const deviceA = await pairFromConsole("Device A");
      const deviceB = await pairFromConsole("Device B");
      // Device A allows Device C with the password, as a paired phone does.
      const code = await send("/api/devices/code", { password }, deviceA);
      const pending = await send("/api/pair", {
        code: (code.json as { code?: string }).code,
        deviceName: "Device C",
      });
      const listed = (await send("/api/devices", undefined, deviceA)).json as unknown as {
        devices: { id: string; name: string }[];
        waiting: { id: string }[];
      };
      await send("/api/devices/allow", { password, requestId: listed.waiting[0]?.id }, deviceA);
      await send("/api/pair/status", { pendingId: pending.json.pendingId });
      const idOfA = listed.devices.find((device) => device.name === "Device A")?.id;

      const revoked = await console.answer({ op: "revoke", deviceId: idOfA });

      expect(revoked).toEqual({
        ok: true,
        allowedDevices: [expect.objectContaining({ name: "Device C", allowedBy: idOfA })],
      });
      expect((await send("/api/session", undefined, deviceA)).status).toBe(401);
      expect((await send("/api/session", undefined, deviceB)).status).toBe(200);
    });

    it("refuses every request while no serve-password is set", async () => {
      const { console, secret } = setup();
      secret.hash = null;

      expect(await console.answer({ op: "code" })).toEqual({ ok: false, reason: "no-password" });
      expect(await console.answer({ op: "devices" })).toEqual({ ok: false, reason: "no-password" });
    });

    it("answers not-found for an id nobody has, and keeps the record unwritten", async () => {
      const { console, coordination } = setup();

      expect(await console.answer({ op: "allow", requestId: "0".repeat(32) })).toEqual({
        ok: false,
        reason: "not-found",
      });
      expect(await console.answer({ op: "revoke", deviceId: `device_${"0".repeat(24)}` })).toEqual({
        ok: false,
        reason: "not-found",
      });
      expect(await coordination.read(pairingKey)).toBeNull();
    });

    it("drops a stored request whose allowedBy isn't text, so it is never allowed", async () => {
      const { console, send, coordination } = setup();
      const made = (await console.answer({ op: "code" })) as unknown as { code: string };
      const pending = await send("/api/pair", { code: made.code, deviceName: "Pixel 9" });
      const stored = await coordination.read(pairingKey);
      const record = JSON.parse(stored ?? "{}") as { codes: { request: object }[] };
      for (const entry of record.codes) entry.request = { ...entry.request, allowedBy: 7 };
      await coordination.compareAndSet(pairingKey, stored, JSON.stringify(record));

      expect(await console.answer({ op: "waiting", code: made.code })).toEqual({
        ok: true,
        waiting: [],
      });
      expect((await send("/api/pair/status", { pendingId: pending.json.pendingId })).status).toBe(
        404,
      );
    });

    it("refuses a request that isn't one of its own, with a malformed id or another field's shape", async () => {
      const { console } = setup();
      const refused = { ok: false, reason: "bad-request" };

      for (const request of [
        null,
        "code",
        { op: "token" },
        { op: "toString" },
        [],
        { op: "devices", deviceId: `device_${"0".repeat(24)}` },
        { op: "allow", requestId: "0".repeat(32), allowedBy: "browser" },
        { op: "waiting" },
        { op: "waiting", code: "x".repeat(40) },
        { op: "allow" },
        { op: "allow", requestId: "../../etc" },
        { op: "revoke", deviceId: "console" },
        { op: "revoke", deviceId: 7 },
      ]) {
        expect(await console.answer(request)).toEqual(refused);
      }
    });
  });
});
