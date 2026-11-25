import type { Coordination } from "@halonicjs/ports";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";
/** The `serve-password` of every test server here. */
export const password = "correct horse";

/** A test server with a password, and helpers to pair devices with it the way a client would. */
export function setup() {
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
    if (answer.status !== 200 || answer.json.code === undefined) {
      throw new Error(`making a pairing code answered ${answer.status}`);
    }
    return answer.json.code;
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

/** The fields a device route may answer. */
export interface Answer {
  state?: string;
  expiresAt?: string;
  sessionEndsAt?: string;
  code?: string;
  pendingId?: string;
  checkCode?: string;
  token?: string;
  devices?: { id: string; name: string; allowedBy: string }[];
  waiting?: { id: string; deviceName: string; checkCode: string }[];
  allowedDevices?: { id: string; name: string }[];
}
