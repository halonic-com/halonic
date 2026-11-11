import { lookup } from "node:dns/promises";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * A site the profile doesn't allow, on a real Windows machine through the
 * session (HAL-6219, HAL-1708 CHECK P6): a program in the fence makes no
 * connection to it, whichever way it tries: srt's proxy over an HTTP CONNECT,
 * plain HTTP or SOCKS, or straight at its address.
 *
 * The `sandbox-windows` CI job maps `blocked.example` and `allowed.example` to
 * `127.0.0.1` in the hosts file, and a listener stands in for the bridge on
 * `127.0.0.1`. srt lets a name resolve to the bridge's address and port,
 * because the bridge is allowed with its port, so the two sites differ only in
 * their name: when the allowed one gets through and the blocked one doesn't,
 * the blocked one was refused on its name, and the listener would have counted
 * a connection had there been one.
 *
 * Only connections count. On Windows the DNS Client service looks a name up
 * for the program, outside the fence, so the program can look up
 * `blocked.example` (ADR 2026-11-11, pluggable sandbox layer). That is a known
 * limit, not a failure here.
 */
const sandbox = new SrtSandbox();

/** All of a program's output as text. */
async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

/**
 * Tries one way to `host:port` and prints `{ "outcome": ... }`: the proxy's
 * HTTP status, the SOCKS reply code (0 is granted), or for `direct`
 * `connected` or `blocked`.
 */
const probe = `const net = require("node:net");
const [way, host, port] = process.argv.slice(2);
const proxy = new URL(process.env.HTTP_PROXY);
const user = decodeURIComponent(proxy.username);
const password = decodeURIComponent(proxy.password);
const authorization = user === "" ? "" : "Proxy-Authorization: Basic " + Buffer.from(user + ":" + password).toString("base64") + "\\r\\n";
const done = (outcome) => { console.log(JSON.stringify({ outcome })); process.exit(0); };
setTimeout(() => done("timed out"), 15000);
const toProxy = () => net.connect({ host: proxy.hostname, port: Number(proxy.port) });
function status(request) {
  const socket = toProxy();
  socket.on("connect", () => socket.write(request));
  socket.once("data", (data) => {
    const line = /^HTTP\\/1\\.[01] (\\d{3})/.exec(data.toString("latin1"));
    done(line ? Number(line[1]) : "no status");
  });
  socket.on("error", (error) => done("proxy error " + error.code));
  socket.on("close", () => done("closed"));
}
function socks() {
  const socket = toProxy();
  const name = Buffer.from(host);
  const number = Number(port);
  let step = 0;
  socket.on("connect", () => socket.write(Buffer.from([5, 1, 2])));
  socket.on("data", (reply) => {
    if (step === 0) {
      if (reply[1] !== 2) return done("no password method");
      step = 1;
      const u = Buffer.from(user);
      const p = Buffer.from(password);
      socket.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([p.length]), p]));
    } else if (step === 1) {
      if (reply[1] !== 0) return done("not signed in");
      step = 2;
      socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([number >> 8, number & 255])]));
    } else done(reply[1]);
  });
  socket.on("error", (error) => done("proxy error " + error.code));
  socket.on("close", () => done("closed"));
}
const target = host + ":" + port;
if (way === "connect") status("CONNECT " + target + " HTTP/1.1\\r\\nHost: " + target + "\\r\\n" + authorization + "\\r\\n");
else if (way === "get") status("GET http://" + target + "/ HTTP/1.1\\r\\nHost: " + target + "\\r\\n" + authorization + "Connection: close\\r\\n\\r\\n");
else if (way === "socks") socks();
else {
  const socket = net.connect({ host, port: Number(port) });
  socket.on("connect", () => done("connected"));
  socket.on("error", () => done("blocked"));
}
`;

describe("a site the profile doesn't allow, on Windows", () => {
  let base: string;
  let work: string;
  let session: SandboxSession;
  let site: Server;
  let port: number;
  let connections = 0;
  const open = new Set<Socket>();

  /** Runs the probe inside the fence for one way to `host` and returns its outcome. */
  async function attempt(way: string, host: string): Promise<unknown> {
    const started = await session.start({
      program: process.execPath,
      args: [join(work, "probe.cjs"), way, host, String(port)],
    });
    const [out, errors] = await Promise.all([
      read(started.stdout),
      read(started.stderr),
      started.exited,
    ]);
    const last = out.trim().split(/\r?\n/).pop() ?? "";
    if (last === "")
      throw new Error(`the probe printed nothing for ${way} ${host}; its errors: ${errors}`);
    return JSON.parse(last).outcome;
  }

  beforeAll(async () => {
    for (const name of ["blocked.example", "allowed.example"]) {
      const { address } = await lookup(name, { family: 4 }).catch(() => ({ address: "none" }));
      if (address !== "127.0.0.1") {
        throw new Error(`${name} must resolve to 127.0.0.1 (the CI job adds it to the hosts file)`);
      }
    }
    base = await mkdtemp(join(process.env["RUNNER_TEMP"] ?? tmpdir(), "srt-blocked-"));
    work = join(base, "work");
    await mkdir(work, { recursive: true });
    await writeFile(join(work, "probe.cjs"), probe);
    // Holds each connection open, so the proxy has time to answer the program.
    site = createServer((socket) => {
      connections += 1;
      open.add(socket);
      socket.on("error", () => {});
      socket.on("close", () => open.delete(socket));
    });
    await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
    port = (site.address() as { port: number }).port;
    session = await sandbox.open({
      workingFolder: work,
      tempFolder: join(base, "temp"),
      settingsFolder: null,
      readOnlyPaths: [],
      deniedPaths: [],
      env: {},
      network: { bridge: { host: "127.0.0.1", port }, allowedSites: ["allowed.example"] },
      timeLimitMs: 120_000,
    });
  });

  afterAll(async () => {
    await session?.close();
    for (const socket of open) socket.destroy();
    site?.close();
    await rm(base, { recursive: true, force: true });
  });

  it("proves the fence", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it("is refused over an HTTP CONNECT, and no connection is made", async () => {
    expect(await attempt("connect", "blocked.example")).toBe(403);
    expect(connections).toBe(0);
  });

  it("is refused over plain HTTP, and no connection is made", async () => {
    expect(await attempt("get", "blocked.example")).toBe(403);
    expect(connections).toBe(0);
  });

  it("is refused over SOCKS, and no connection is made", async () => {
    const reply = await attempt("socks", "blocked.example");
    expect(typeof reply).toBe("number");
    expect(reply).not.toBe(0);
    expect(connections).toBe(0);
  });

  it("can't be reached straight at its address either", async () => {
    expect(await attempt("direct", "blocked.example")).toBe("blocked");
    expect(connections).toBe(0);
  });

  it("while an allowed site at the same address and port is reached, which shows a connection would be seen", async () => {
    expect(await attempt("connect", "allowed.example")).toBe(200);
    expect(await attempt("socks", "allowed.example")).toBe(0);
    expect(connections).toBe(2);
  });
});
