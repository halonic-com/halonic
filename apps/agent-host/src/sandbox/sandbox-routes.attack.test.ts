import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  Sandbox,
  SandboxBlockListener,
  SandboxCapabilities,
  SandboxCheck,
  SandboxFence,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type HostRoute, type HostServer, startHostServer } from "../server/host-server.ts";
import { maxBodyBytes } from "../server/json-body.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { sandboxRoutes } from "./sandbox-routes.ts";
import { SessionTable } from "./session-table.ts";

/**
 * Attacks on the sandbox routes from another program on the same computer:
 * it can reach the loopback port, but it doesn't have this launch's token.
 * And attacks from a caller that has the token but misbehaves: replays,
 * races, oversized bodies and sessions it never closes.
 */

const token = randomLaunchToken();
const root = resolve(tmpdir(), "agent-host-attack-test");

const profile: SandboxProfile = {
  workingFolder: `${root}/project`,
  tempFolder: `${root}/tmp`,
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: null, allowedSites: [] },
  timeLimitMs: 60_000,
};

class FakeSession implements SandboxSession {
  readonly listeners = new Set<SandboxBlockListener>();
  fence: SandboxFence = { state: "fenced" };
  closeCount = 0;
  readonly profile: SandboxProfile;

  constructor(profile: SandboxProfile) {
    this.profile = profile;
  }

  start(): never {
    throw new Error("not used here");
  }

  onBlocked(listener: SandboxBlockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    this.fence = { state: "stopped" };
  }
}

class FakeSandbox implements Sandbox {
  readonly opened: FakeSession[] = [];
  openCalls = 0;
  hold: Promise<void> | undefined;
  readonly openCalled = later();

  async check(): Promise<SandboxCheck> {
    return { ok: true, reason: null, missing: [] };
  }

  capabilities(): SandboxCapabilities {
    return { files: "shared", strength: "os" };
  }

  async open(profile: SandboxProfile): Promise<SandboxSession> {
    this.openCalls += 1;
    this.openCalled.settle();
    await this.hold;
    const session = new FakeSession(profile);
    this.opened.push(session);
    return session;
  }
}

function later(): { promise: Promise<void>; settle: () => void } {
  let settle: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/** Waits until `condition` holds, for the server's side of a closed connection. */
async function eventually(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 200 && !condition(); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
}

let server: HostServer | undefined;
let sandbox: FakeSandbox;
let sessions: SessionTable;
/** How many open requests' connections the server has seen close. */
let openConnectionsClosed: number;

afterEach(async () => {
  await sessions.closeAll();
  await server?.close();
  server = undefined;
});

async function started(): Promise<{ url: string; port: number }> {
  sandbox = new FakeSandbox();
  sessions = new SessionTable();
  openConnectionsClosed = 0;
  server = await startHostServer(token, sandboxRoutes(sandbox, sessions).map(heardClosing));
  return { url: server.url, port: Number(new URL(server.url).port) };
}

/** The route, counting in `openConnectionsClosed` when an open request's connection closes. */
function heardClosing(route: HostRoute): HostRoute {
  if (route.path !== "/v1/sandbox/sessions/open") return route;
  return {
    ...route,
    handle: (request, response) => {
      response.once("close", () => {
        openConnectionsClosed += 1;
      });
      return route.handle(request, response);
    },
  };
}

/**
 * Writes `raw` bytes to the port, as any local program can, and resolves with
 * everything the host sends back once it closes the connection (or after
 * `waitMs`, whichever comes first).
 */
function rawExchange(port: number, raw: string | Buffer, waitMs = 2_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(port, "127.0.0.1", () => socket.write(raw));
    const timer = setTimeout(() => socket.destroy(), waitMs);
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function statusOf(answer: string): number {
  return Number(answer.split(" ")[1]);
}

const openBody = JSON.stringify({ profile });

function rawPost(port: number, path: string, headers: string[], body: string): string {
  return [
    `POST ${path} HTTP/1.1`,
    `Host: 127.0.0.1:${port}`,
    "Content-Type: application/json",
    `Content-Length: ${Buffer.byteLength(body)}`,
    ...headers,
    "",
    body,
  ].join("\r\n");
}

function post(url: string, path: string, body: unknown, init: RequestInit = {}): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}

async function openSession(url: string): Promise<string> {
  const answer = (await (await post(url, "/v1/sandbox/sessions/open", { profile })).json()) as {
    session: string;
  };
  return answer.session;
}

describe("sandbox routes, attacked by another local program without the token", () => {
  it("opens no sandbox for a request without a token, a wrong one or a near miss", async () => {
    const { port } = await started();
    const attempts = [
      [],
      ["Authorization: Bearer"],
      [`Authorization: Bearer ${"A".repeat(token.length)}`],
      [`Authorization: bearer ${token}`],
      [`Authorization: Bearer  ${token}`],
      [`Authorization: Bearer ${token.slice(0, -1)}`],
      [`Authorization: Bearer ${token}x`],
      [`Authorization: Basic ${Buffer.from(`x:${token}`).toString("base64")}`],
      [`Authorization: ${token}`],
      [`X-Token: ${token}`],
      // A second Authorization header is dropped by Node: only the first one counts.
      ["Authorization: Bearer wrong", `Authorization: Bearer ${token}`],
    ];
    for (const headers of attempts) {
      const answer = await rawExchange(
        port,
        rawPost(port, "/v1/sandbox/sessions/open", headers, openBody),
      );
      expect(statusOf(answer), headers.join(" | ")).toBe(401);
    }
    expect(sandbox.openCalls).toBe(0);
  });

  it("doesn't take the token from the query or the body", async () => {
    const { port } = await started();
    const inQuery = await rawExchange(
      port,
      rawPost(port, `/v1/sandbox/sessions/open?token=${token}`, [], openBody),
    );
    expect(statusOf(inQuery)).toBe(401);
    const inBody = await rawExchange(
      port,
      rawPost(port, "/v1/sandbox/sessions/open", [], JSON.stringify({ profile, token })),
    );
    expect(statusOf(inBody)).toBe(401);
    expect(sandbox.openCalls).toBe(0);
  });

  it("refuses the token when the request names another host or comes from a web page", async () => {
    const { port } = await started();
    const auth = `Authorization: Bearer ${token}`;
    const cases: [string, string[], number][] = [
      // Node itself refuses an HTTP/1.1 request without Host, before the host's checks.
      ["no Host", [auth], 400],
      ["rebound name", [`Host: evil.example:${port}`, auth], 421],
      ["host with a suffix", [`Host: 127.0.0.1:${port}.evil.example`, auth], 421],
      ["another port", [`Host: 127.0.0.1:${port + 1}`, auth], 421],
      ["IPv6 loopback", [`Host: [::1]:${port}`, auth], 421],
      ["null origin", [`Host: 127.0.0.1:${port}`, auth, "Origin: null"], 403],
      ["own origin", [`Host: 127.0.0.1:${port}`, auth, `Origin: http://127.0.0.1:${port}`], 403],
    ];
    for (const [name, headers, status] of cases) {
      const raw = [
        "POST /v1/sandbox/sessions/open HTTP/1.1",
        ...headers,
        "Content-Type: application/json",
        `Content-Length: ${Buffer.byteLength(openBody)}`,
        "",
        openBody,
      ].join("\r\n");
      expect(statusOf(await rawExchange(port, raw)), name).toBe(status);
    }
    expect(sandbox.openCalls).toBe(0);
  });

  it("answers an unauthenticated request without reading its body, and hangs up", async () => {
    const { port } = await started();
    // Claims a 1 GiB body and sends none of it: the host must not wait for it.
    const raw = [
      "POST /v1/sandbox/sessions/open HTTP/1.1",
      `Host: 127.0.0.1:${port}`,
      "Content-Type: application/json",
      `Content-Length: ${1024 ** 3}`,
      "",
      "",
    ].join("\r\n");
    const started_ = Date.now();
    const answer = await rawExchange(port, raw, 5_000);
    expect(statusOf(answer)).toBe(401);
    expect(answer.toLowerCase()).toContain("connection: close");
    expect(Date.now() - started_).toBeLessThan(5_000);
  });

  it("checks each pipelined request on its own, not once per connection", async () => {
    const { port } = await started();
    // The first request has the token; the second, on the same connection, doesn't.
    const withToken = rawPost(
      port,
      "/v1/sandbox/sessions/open",
      [`Authorization: Bearer ${token}`],
      openBody,
    );
    const without = rawPost(port, "/v1/sandbox/sessions/open", [], openBody);
    const answer = await rawExchange(port, withToken + without);
    expect([...answer.matchAll(/HTTP\/1\.1 (\d+)/g)].map((match) => match[1])).toEqual([
      "200",
      "401",
    ]);
    expect(sandbox.openCalls).toBe(1);
  });

  it("serves only the exact paths and methods", async () => {
    const { url } = await started();
    const authorization = `Bearer ${token}`;
    const near: [string, string][] = [
      ["POST", "/v1/sandbox/sessions/open/"],
      ["POST", "//v1/sandbox/sessions/open"],
      ["POST", "/v1/sandbox/sessions/%6Fpen"],
      ["POST", "/V1/sandbox/sessions/open"],
      ["POST", "/v1/sandbox/sessions/../sessions/open/x"],
      ["PUT", "/v1/sandbox/sessions/open"],
      ["GET", "/v1/sandbox/sessions/open"],
      ["HEAD", "/v1/sandbox/check"],
    ];
    for (const [method, path] of near) {
      const answer = await fetch(`${url}${path}`, {
        method,
        headers: { authorization, "content-type": "application/json" },
        ...(method === "GET" || method === "HEAD" ? {} : { body: openBody }),
      });
      expect(answer.status, `${method} ${path}`).toBe(404);
    }
    expect(sandbox.openCalls).toBe(0);
  });
});

describe("sandbox routes, attacked by a caller with the token", () => {
  it("refuses a body over the cap, chunked or with a lying length, and opens nothing", async () => {
    const { port } = await started();
    const auth = `Authorization: Bearer ${token}`;
    const huge = "x".repeat(maxBodyBytes + 1);
    // Chunked: no length up front, so only the running count can stop it.
    const chunked = [
      "POST /v1/sandbox/sessions/open HTTP/1.1",
      `Host: 127.0.0.1:${port}`,
      auth,
      "Content-Type: application/json",
      "Transfer-Encoding: chunked",
      "",
      `${huge.length.toString(16)}\r\n${huge}\r\n0\r\n\r\n`,
    ].join("\r\n");
    expect(statusOf(await rawExchange(port, chunked))).toBe(413);
    // Claims 2 GiB and stops after the cap: the host answers without waiting for the rest.
    const lying = [
      "POST /v1/sandbox/sessions/open HTTP/1.1",
      `Host: 127.0.0.1:${port}`,
      auth,
      "Content-Type: application/json",
      `Content-Length: ${2 * 1024 ** 3}`,
      "",
      huge,
    ].join("\r\n");
    expect(statusOf(await rawExchange(port, lying, 5_000))).toBe(413);
    // Many times the cap, all of it sent: still being sent when the host answers.
    // Closing then would reset the connection, and the caller would lose the answer.
    const flood = "x".repeat(16 * maxBodyBytes);
    const honest = [
      "POST /v1/sandbox/sessions/open HTTP/1.1",
      `Host: 127.0.0.1:${port}`,
      auth,
      "Content-Type: application/json",
      `Content-Length: ${flood.length}`,
      "",
      flood,
    ].join("\r\n");
    expect(statusOf(await rawExchange(port, honest, 5_000))).toBe(413);
    expect(sandbox.openCalls).toBe(0);
  });

  it("refuses a profile that smuggles extra keys or out-of-range values", async () => {
    const { url } = await started();
    const bad: unknown[] = [
      { ...profile, extra: true },
      { ...profile, network: { bridge: null, allowedSites: [], all: true } },
      { ...profile, network: { allowedSites: [] } },
      { ...profile, network: { bridge: { host: "127.0.0.1", port: 0 }, allowedSites: [] } },
      { ...profile, network: { bridge: { host: "127.0.0.1", port: 65_536 }, allowedSites: [] } },
      { ...profile, timeLimitMs: 0 },
      { ...profile, timeLimitMs: 1.5 },
      { ...profile, deniedPaths: ["relative"] },
      { ...profile, readOnlyPaths: [""] },
      { ...profile, env: { PATH: 1 } },
      { ...profile, workingFolder: null },
    ];
    for (const candidate of bad) {
      const answer = await post(url, "/v1/sandbox/sessions/open", { profile: candidate });
      expect(answer.status, JSON.stringify(candidate)).toBe(400);
    }
    const wrapped = await post(url, "/v1/sandbox/sessions/open", { profile, also: 1 });
    expect(wrapped.status).toBe(400);
    expect(sandbox.openCalls).toBe(0);
  });

  it("doesn't let a __proto__ key in the profile reach any object's prototype", async () => {
    const { url } = await started();
    const body = `{"profile":${JSON.stringify(profile).replace(
      '"env":{}',
      '"env":{"__proto__":"polluted","constructor":"x"}',
    )}}`;
    const answer = await post(url, "/v1/sandbox/sessions/open", body);
    expect([200, 400]).toContain(answer.status);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    const env = sandbox.opened[0]?.profile.env;
    if (env !== undefined) expect(Object.getPrototypeOf(env)).toBe(Object.prototype);
  });

  it("closes a session once, however many times its close is replayed", async () => {
    const { url } = await started();
    const id = await openSession(url);
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => post(url, "/v1/sandbox/sessions/close", { session: id })),
    );
    const statuses = answers.map((answer) => answer.status).sort();
    expect(statuses).toEqual([200, 404, 404, 404, 404]);
    expect(sandbox.opened[0]?.closeCount).toBe(1);
  });

  it("knows no session by a guessed, shaped or prototype id", async () => {
    const { url } = await started();
    await openSession(url);
    const guesses = [
      "00000000-0000-0000-0000-000000000000",
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
    ];
    for (const session of guesses) {
      for (const path of ["/v1/sandbox/sessions/close", "/v1/sandbox/sessions/blocked"]) {
        expect((await post(url, path, { session })).status, `${path} ${session}`).toBe(404);
      }
    }
    for (const session of [1, null, ["x"], { id: "x" }, ""]) {
      expect((await post(url, "/v1/sandbox/sessions/close", { session })).status).toBe(400);
    }
    expect(sandbox.opened[0]?.closeCount).toBe(0);
  });

  it("closes a session whose caller hung up while it opened", async () => {
    const { url } = await started();
    const release = later();
    sandbox.hold = release.promise;
    const abort = new AbortController();
    const answer = post(url, "/v1/sandbox/sessions/open", { profile }, { signal: abort.signal });
    await sandbox.openCalled.promise;
    abort.abort();
    await expect(answer).rejects.toThrow();
    // The server sees the closed connection before the session arrives. The ceiling stays under
    // the test timeout, so a close the server never sees fails here and not on "Test timed out".
    await vi.waitFor(() => expect(openConnectionsClosed).toBe(1), { timeout: 4_000 });
    release.settle();
    await eventually(() => sandbox.opened[0]?.closeCount === 1);
    // Nobody can name it: the table holds nothing to close at stop.
    await sessions.closeAll();
    expect(sandbox.opened[0]?.closeCount).toBe(1);
  });

  it("stops listening for blocks when the caller hangs up on the stream", async () => {
    const { url } = await started();
    const id = await openSession(url);
    const abort = new AbortController();
    const stream = await post(
      url,
      "/v1/sandbox/sessions/blocked",
      { session: id },
      { signal: abort.signal },
    );
    expect(stream.status).toBe(200);
    expect(sandbox.opened[0]?.listeners.size).toBe(1);
    abort.abort();
    await eventually(() => sandbox.opened[0]?.listeners.size === 0);
    // The session itself stays open until it is closed.
    expect(sandbox.opened[0]?.closeCount).toBe(0);
  });

  it("ends every stream on a session when it closes, so none waits forever", async () => {
    const { url } = await started();
    const id = await openSession(url);
    const streams = await Promise.all(
      [1, 2, 3].map(() => post(url, "/v1/sandbox/sessions/blocked", { session: id })),
    );
    expect(sandbox.opened[0]?.listeners.size).toBe(3);
    await post(url, "/v1/sandbox/sessions/close", { session: id });
    expect(await Promise.all(streams.map((stream) => stream.text()))).toEqual(["", "", ""]);
    expect(sandbox.opened[0]?.listeners.size).toBe(0);
  });

  it("closes every session nobody closed when the host stops", async () => {
    const { url } = await started();
    const ids = await Promise.all([1, 2, 3, 4].map(() => openSession(url)));
    expect(new Set(ids).size).toBe(4);
    await sessions.closeAll();
    expect(sandbox.opened.map((session) => session.closeCount)).toEqual([1, 1, 1, 1]);
  });
});
