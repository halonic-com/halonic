import dns from "node:dns";
import { mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import { connect, isIP, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildSrtConfig } from "../src/srt-config.ts";

/**
 * A site the profile doesn't allow is refused on its name, before srt looks
 * the name up (HAL-1708, CHECK P6): so a blocked site learns nothing, not even
 * a DNS query for its name. Runs srt's own proxies, filter and resolved-address
 * guard in this process, the same code the srt command runs, with every name
 * lookup recorded and answered "not found" so nothing leaves the machine
 * (Node passes an address like `127.0.0.1` through the same lookup, so those
 * go on to the real one).
 * Needs a machine where srt can start, like the other tests in `fence/`.
 */
const looked: string[] = [];
const realLookup = dns.lookup;

function recordLookups(): void {
  const lookup = (hostname: string, ...rest: unknown[]) => {
    if (isIP(hostname) !== 0) {
      return (realLookup as (...args: unknown[]) => void)(hostname, ...rest);
    }
    looked.push(hostname);
    const callback = rest.at(-1) as (error: Error) => void;
    const notFound = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
      code: "ENOTFOUND",
    });
    process.nextTick(callback, notFound);
  };
  (dns as { lookup: unknown }).lookup = lookup;
  syncBuiltinESMExports();
}

function restoreLookups(): void {
  dns.lookup = realLookup;
  syncBuiltinESMExports();
}

function proxyAuthorization(): string {
  const token = SandboxManager.getProxyAuthToken() ?? "";
  return `Basic ${Buffer.from(`srt:${token}`).toString("base64")}`;
}

/** The status srt's HTTP proxy answers a CONNECT to `host:443` with. */
function httpConnect(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port: SandboxManager.getProxyPort(),
      method: "CONNECT",
      path: `${host}:443`,
      headers: { "proxy-authorization": proxyAuthorization() },
    });
    req.on("connect", (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

/** The status srt's HTTP proxy answers a plain `GET http://host/` with. */
function httpGet(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port: SandboxManager.getProxyPort(),
      path: `http://${host}/`,
      headers: { host, "proxy-authorization": proxyAuthorization() },
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

/** Reads exactly `length` bytes from the socket. */
function readBytes(socket: Socket, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < length) return;
      socket.off("data", onData);
      socket.off("error", reject);
      if (buffered.length > length) socket.unshift(buffered.subarray(length));
      resolve(buffered.subarray(0, length));
    };
    socket.on("data", onData);
    socket.on("error", reject);
  });
}

/** The reply code srt's SOCKS5 proxy answers a CONNECT to `host:443` with (0 is granted). */
async function socksConnect(host: string): Promise<number> {
  const socket = connect(SandboxManager.getSocksProxyPort() ?? 0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    socket.write(Buffer.from([5, 1, 2]));
    expect([...(await readBytes(socket, 2))]).toEqual([5, 2]);
    const user = Buffer.from("srt");
    const password = Buffer.from(SandboxManager.getProxyAuthToken() ?? "");
    socket.write(
      Buffer.concat([
        Buffer.from([1, user.length]),
        user,
        Buffer.from([password.length]),
        password,
      ]),
    );
    expect([...(await readBytes(socket, 2))]).toEqual([1, 0]);
    const name = Buffer.from(host);
    socket.write(
      Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([1, 187])]),
    );
    const [, reply] = await readBytes(socket, 2);
    return reply ?? -1;
  } finally {
    socket.destroy();
  }
}

describe("a site the profile doesn't allow", () => {
  let base: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "srt-blocked-"));
    recordLookups();
    await SandboxManager.initialize(
      buildSrtConfig({
        workingFolder: base,
        tempFolder: base,
        settingsFolder: null,
        readOnlyPaths: [],
        deniedPaths: [],
        env: {},
        network: {
          bridge: { host: "127.0.0.1", port: 4100 },
          allowedSites: ["allowed.example"],
        },
        timeLimitMs: 60_000,
      }),
    );
  });

  afterAll(async () => {
    await SandboxManager.reset();
    restoreLookups();
    await rm(base, { recursive: true, force: true });
  });

  beforeEach(() => {
    looked.length = 0;
  });

  it("is refused over an HTTP CONNECT without its name being looked up", async () => {
    expect(await httpConnect("blocked.example")).toBe(403);
    expect(looked).toEqual([]);
  });

  it("is refused over plain HTTP without its name being looked up", async () => {
    expect(await httpGet("blocked.example")).toBe(403);
    expect(looked).toEqual([]);
  });

  it("is refused over SOCKS without its name being looked up", async () => {
    expect(await socksConnect("blocked.example")).not.toBe(0);
    expect(looked).toEqual([]);
  });

  it("while an allowed site's name is looked up, which shows the lookups are watched", async () => {
    await httpConnect("allowed.example");
    await httpGet("allowed.example");
    await socksConnect("allowed.example");
    expect(looked.filter((name) => name === "allowed.example")).toHaveLength(3);
  });
});
