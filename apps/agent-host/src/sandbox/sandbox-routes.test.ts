import { type IncomingMessage, request } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  Sandbox,
  SandboxBlock,
  SandboxBlockListener,
  SandboxCapabilities,
  SandboxCheck,
  SandboxFence,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { maxBodyBytes } from "../server/json-body.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { maxUnsentBytes } from "../server/ndjson-stream.ts";
import { maxTimeLimitMs } from "./profile-schema.ts";
import { sandboxRoutes } from "./sandbox-routes.ts";
import { SessionTable } from "./session-table.ts";

const token = randomLaunchToken();
/** An absolute folder in this computer's notation; nothing is written there. */
const root = resolve(tmpdir(), "agent-host-test");

const profile: SandboxProfile = {
  workingFolder: `${root}/project`,
  tempFolder: `${root}/tmp`,
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [`${root}/secrets`],
  env: { PATH: "/usr/bin" },
  network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

/** A session that records whether it was closed and lets a test report blocks. */
class FakeSession implements SandboxSession {
  readonly listeners = new Set<SandboxBlockListener>();
  fence: SandboxFence = { state: "fenced" };
  closed = false;
  /** When set, `close` stops the session's work but then rejects, as a broken sandbox would. */
  failClose = false;
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

  block(block: SandboxBlock): void {
    for (const listener of this.listeners) listener(block);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.fence = { state: "stopped" };
    if (this.failClose) throw new Error("the sandbox didn't answer");
  }
}

class FakeSandbox implements Sandbox {
  readonly opened: FakeSession[] = [];
  refuseOpen = false;
  /** When set, `open` waits for it before it answers: a session still opening. */
  hold: Promise<void> | undefined;
  /** Settles when `open` is called. */
  readonly openCalled = signal();

  async check(): Promise<SandboxCheck> {
    return { ok: true, reason: null, missing: [] };
  }

  capabilities(): SandboxCapabilities {
    return { files: "shared", strength: "os" };
  }

  async open(profile: SandboxProfile): Promise<SandboxSession> {
    this.openCalled.settle();
    if (this.refuseOpen) throw new Error("bubblewrap is not installed");
    await this.hold;
    const session = new FakeSession(profile);
    this.opened.push(session);
    return session;
  }
}

/** A promise the test settles by hand. */
function signal(): { promise: Promise<void>; settle: () => void } {
  let settle: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

let server: HostServer | undefined;
let sandbox: FakeSandbox;
let sessions: SessionTable;

afterEach(async () => {
  await sessions.closeAll();
  await server?.close();
  server = undefined;
});

async function started(table = new SessionTable()): Promise<string> {
  sandbox = new FakeSandbox();
  sessions = table;
  server = await startHostServer(token, sandboxRoutes(sandbox, sessions));
  return server.url;
}

const authorization = { authorization: `Bearer ${token}` };

function post(url: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/**
 * Starts a POST whose head says `Content-Length: contentLength`, then sends
 * only `body`, as a caller that promises more than it sends would.
 */
function postPromising(
  url: string,
  path: string,
  contentLength: number,
  body: string,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const sent = request(`${url}${path}`, {
      method: "POST",
      headers: {
        ...authorization,
        "content-type": "application/json",
        "content-length": String(contentLength),
      },
    });
    sent.on("response", resolve).on("error", reject);
    sent.write(body);
  });
}

async function openSession(url: string): Promise<string> {
  const answer = (await (await post(url, "/v1/sandbox/sessions/open", { profile })).json()) as {
    session: string;
  };
  return answer.session;
}

describe("sandboxRoutes", () => {
  it("answers check and capabilities as the sandbox does", async () => {
    const url = await started();
    const check = await fetch(`${url}/v1/sandbox/check`, { headers: authorization });
    expect(await check.json()).toEqual({ ok: true, reason: null, missing: [] });
    const capabilities = await fetch(`${url}/v1/sandbox/capabilities`, { headers: authorization });
    expect(await capabilities.json()).toEqual({ files: "shared", strength: "os" });
  });

  it("opens a session with the profile and answers its id and fence", async () => {
    const url = await started();
    const answer = await post(url, "/v1/sandbox/sessions/open", { profile });
    expect(answer.status).toBe(200);
    const body = (await answer.json()) as { session: string; fence: SandboxFence };
    expect(body.session).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.fence).toEqual({ state: "fenced" });
    expect(sandbox.opened[0]?.profile).toEqual(profile);
  });

  it("refuses a profile that isn't valid, naming each problem, and opens nothing", async () => {
    const url = await started();
    const bad = { ...profile, workingFolder: "relative/path", network: { allowedSites: [] } };
    const answer = await post(url, "/v1/sandbox/sessions/open", { profile: bad });
    expect(answer.status).toBe(400);
    const { error } = (await answer.json()) as { error: { kind: string; message: string } };
    expect(error.kind).toBe("body_invalid");
    expect(error.message).toContain("profile.workingFolder");
    expect(error.message).toContain("profile.network.bridge");
    expect(sandbox.opened).toHaveLength(0);
  });

  it("refuses a body that isn't JSON or is too large", async () => {
    const url = await started();
    expect((await post(url, "/v1/sandbox/sessions/open", "{not json")).status).toBe(400);
    const huge = JSON.stringify({
      profile: { ...profile, env: { BIG: "x".repeat(maxBodyBytes) } },
    });
    expect((await post(url, "/v1/sandbox/sessions/open", huge)).status).toBe(413);
  });

  it("refuses a body promised over the limit before it arrives, and opens nothing", async () => {
    const url = await started();
    const answer = await postPromising(url, "/v1/sandbox/sessions/open", 1024 ** 3, "");
    expect(answer.statusCode).toBe(413);
    expect(answer.headers.connection).toBe("close");
    answer.resume();
    expect(sandbox.opened).toHaveLength(0);
  });

  it("still reads a body of a declared length within the limit", async () => {
    const url = await started();
    const body = JSON.stringify({ profile });
    const answer = await postPromising(
      url,
      "/v1/sandbox/sessions/open",
      Buffer.byteLength(body),
      body,
    );
    expect(answer.statusCode).toBe(200);
    answer.resume();
    expect(sandbox.opened).toHaveLength(1);
  });

  it("says why the sandbox couldn't open", async () => {
    const url = await started();
    sandbox.refuseOpen = true;
    const answer = await post(url, "/v1/sandbox/sessions/open", { profile });
    expect(answer.status).toBe(422);
    expect(await answer.json()).toEqual({
      error: { kind: "sandbox_open_failed", message: "bubblewrap is not installed" },
    });
  });

  it("streams the session's blocked accesses until it closes", async () => {
    const url = await started();
    const id = await openSession(url);
    const stream = await post(url, "/v1/sandbox/sessions/blocked", { session: id });
    expect(stream.headers.get("content-type")).toContain("application/x-ndjson");

    const session = sandbox.opened[0];
    session?.block({ kind: "file", path: `${root}/secrets/key`, access: "read" });
    session?.block({ kind: "network", host: "example.com", port: 443 });
    const closed = await post(url, "/v1/sandbox/sessions/close", { session: id });
    expect(await closed.json()).toEqual({ closed: true });

    const lines = (await stream.text()).trim().split("\n");
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { kind: "file", path: `${root}/secrets/key`, access: "read" },
      { kind: "network", host: "example.com", port: 443 },
    ]);
    expect(session?.closed).toBe(true);
    expect(session?.listeners.size).toBe(0);
  });

  it("ends the stream of a caller that stops reading, and stops listening", async () => {
    const url = await started();
    const id = await openSession(url);
    const stream = await postPromising(
      url,
      "/v1/sandbox/sessions/blocked",
      Buffer.byteLength(JSON.stringify({ session: id })),
      JSON.stringify({ session: id }),
    );
    stream.pause();
    const cutOff = new Promise((resolve) => stream.on("aborted", resolve));

    const session = sandbox.opened[0];
    const block = {
      kind: "file",
      path: `${root}/${"x".repeat(64 * 1024)}`,
      access: "read",
    } as const;
    let sent = 0;
    while (sent < 16 * maxUnsentBytes && (session?.listeners.size ?? 0) > 0) {
      session?.block(block);
      sent += block.path.length;
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(sent).toBeLessThan(16 * maxUnsentBytes);
    expect(session?.listeners.size).toBe(0);
    stream.resume();
    await cutOff;
    // The session itself stays open until Studio closes it.
    expect(session?.closed).toBe(false);
  });

  it("knows no session by an id it didn't make, or after it closed", async () => {
    const url = await started();
    const id = await openSession(url);
    await post(url, "/v1/sandbox/sessions/close", { session: id });
    for (const path of ["/v1/sandbox/sessions/close", "/v1/sandbox/sessions/blocked"]) {
      for (const session of [id, "not-a-session"]) {
        const answer = await post(url, path, { session });
        expect(answer.status).toBe(404);
      }
    }
  });

  it("closes every session when the host stops", async () => {
    const url = await started();
    await openSession(url);
    await openSession(url);
    await sessions.closeAll();
    expect(sandbox.opened.map((session) => session.closed)).toEqual([true, true]);
  });

  it("opens no session once the host is stopping", async () => {
    const url = await started();
    await sessions.closeAll();
    const answer = await post(url, "/v1/sandbox/sessions/open", { profile });
    expect(answer.status).toBe(503);
    const { error } = (await answer.json()) as { error: { kind: string } };
    expect(error.kind).toBe("host_stopping");
    expect(sandbox.opened).toHaveLength(0);
  });

  it("closes a session that was still opening when the host began to stop", async () => {
    const url = await started();
    const release = signal();
    sandbox.hold = release.promise;
    const answer = post(url, "/v1/sandbox/sessions/open", { profile });
    await sandbox.openCalled.promise;
    await sessions.closeAll();
    release.settle();
    expect((await answer).status).toBe(503);
    expect(sandbox.opened[0]?.closed).toBe(true);
  });

  it("ends a session's stream and closes the others when one fails to close", async () => {
    const url = await started();
    const failing = await openSession(url);
    await openSession(url);
    const [broken, healthy] = sandbox.opened;
    if (broken !== undefined) broken.failClose = true;
    const stream = await post(url, "/v1/sandbox/sessions/blocked", { session: failing });
    await sessions.closeAll();
    expect(await stream.text()).toBe("");
    expect(healthy?.closed).toBe(true);
    expect(broken?.listeners.size).toBe(0);
  });

  it("closes a session whose time limit ran out, so its id and stream end too", async () => {
    // The test runs out the limit by hand once the stream is open: a real
    // timer could fire before the stream's request arrives on a busy machine.
    const limits: { fire: () => void; ms: number }[] = [];
    const url = await started(
      new SessionTable({
        setLimitTimer: (fire, ms) => {
          limits.push({ fire, ms });
          return () => {};
        },
      }),
    );
    const answer = await post(url, "/v1/sandbox/sessions/open", {
      profile: { ...profile, timeLimitMs: 50 },
    });
    const { session: id } = (await answer.json()) as { session: string };
    const stream = await post(url, "/v1/sandbox/sessions/blocked", { session: id });
    expect(stream.status).toBe(200);
    expect(sandbox.opened[0]?.closed).toBe(false);

    expect(limits.map((limit) => limit.ms)).toEqual([50]);
    limits[0]?.fire();
    expect(await stream.text()).toBe("");
    expect(sandbox.opened[0]?.closed).toBe(true);
    expect((await post(url, "/v1/sandbox/sessions/close", { session: id })).status).toBe(404);
  });

  it("refuses a time limit longer than a timer can hold", async () => {
    const url = await started();
    const tooLong = { ...profile, timeLimitMs: maxTimeLimitMs + 1 };
    expect((await post(url, "/v1/sandbox/sessions/open", { profile: tooLong })).status).toBe(400);
    const longest = { ...profile, timeLimitMs: maxTimeLimitMs };
    expect((await post(url, "/v1/sandbox/sessions/open", { profile: longest })).status).toBe(200);
  });

  it("keeps no more sessions than its limit, counting those still opening", async () => {
    const url = await started(new SessionTable({ maxSessions: 2 }));
    const release = signal();
    sandbox.hold = release.promise;
    const opening = post(url, "/v1/sandbox/sessions/open", { profile });
    await sandbox.openCalled.promise;
    sandbox.hold = undefined;
    const open = await openSession(url);

    const refused = await post(url, "/v1/sandbox/sessions/open", { profile });
    expect(refused.status).toBe(429);
    const { error } = (await refused.json()) as { error: { kind: string } };
    expect(error.kind).toBe("too_many_sessions");

    release.settle();
    expect((await opening).status).toBe(200);
    expect((await post(url, "/v1/sandbox/sessions/open", { profile })).status).toBe(429);
    await post(url, "/v1/sandbox/sessions/close", { session: open });
    expect((await post(url, "/v1/sandbox/sessions/open", { profile })).status).toBe(200);
  });

  it("frees the place of a session that failed to open", async () => {
    const url = await started(new SessionTable({ maxSessions: 1 }));
    sandbox.refuseOpen = true;
    expect((await post(url, "/v1/sandbox/sessions/open", { profile })).status).toBe(422);
    sandbox.refuseOpen = false;
    expect((await post(url, "/v1/sandbox/sessions/open", { profile })).status).toBe(200);
  });
});
