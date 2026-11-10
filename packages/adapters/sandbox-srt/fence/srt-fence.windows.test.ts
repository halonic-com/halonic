import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * The fence on a real Windows machine, through `SandboxSession` (HAL-4347):
 * the session itself must report `fenced`, and a program it starts must see
 * the hidden file, the blocked port and its own variables as the profile says.
 * Run by the `sandbox-windows` CI job after srt's Windows install
 * (`vitest.fence-windows.config.ts`). There is no `sh`, `cat` or `env` there,
 * so the programs are Node scripts in the working folder.
 *
 * It works outside the user profile (RUNNER_TEMP in CI), because the sandbox
 * account cannot look inside the profile of the user who ran the install.
 */
const sandbox = new SrtSandbox();

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

describe("SrtSandbox on Windows, through the session", () => {
  let base: string;
  let work: string;
  let session: SandboxSession;
  let canary: Server;
  let canaryPort: number;
  let connections = 0;

  const profile = (): SandboxProfile => ({
    workingFolder: work,
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [join(base, "secrets")],
    env: { HALONIC_FENCE_VAR: "a value with spaces" },
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  /** Runs a Node script from the working folder inside the fence and returns what it printed. */
  async function runScript(name: string, source: string, inside = session): Promise<string> {
    await writeFile(join(work, name), source);
    const started = await inside.start({ program: process.execPath, args: [join(work, name)] });
    const [out, errors] = await Promise.all([
      read(started.stdout),
      read(started.stderr),
      started.exited,
    ]);
    if (out.trim() === "") throw new Error(`${name} printed nothing; its errors: ${errors}`);
    return out.trim();
  }

  beforeAll(async () => {
    base = await mkdtemp(join(process.env["RUNNER_TEMP"] ?? tmpdir(), "srt-win-"));
    work = join(base, "work");
    await mkdir(work, { recursive: true });
    await mkdir(join(base, "secrets"), { recursive: true });
    await writeFile(join(base, "secrets", "key.txt"), "hunter2");
    canary = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => canary.listen(0, "127.0.0.1", resolve));
    canaryPort = (canary.address() as { port: number }).port;
    session = await sandbox.open(profile());
  });

  afterAll(async () => {
    await session?.close();
    canary?.close();
    await rm(base, { recursive: true, force: true });
  });

  it("can start on this machine", async () => {
    expect(await sandbox.check()).toEqual({ ok: true, reason: null, missing: [] });
  });

  it("proves the fence", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it("hides the denied file, blocks the port, and sets the profile's variable", async () => {
    const out = await runScript(
      "probe.cjs",
      `const fs = require("node:fs");
const net = require("node:net");
const result = { variable: process.env.HALONIC_FENCE_VAR };
try { fs.writeFileSync(${JSON.stringify(join(work, "made.txt"))}, "x"); result.write = "written"; } catch { result.write = "refused"; }
try { fs.writeFileSync(${JSON.stringify(join(base, "outside.txt"))}, "x"); result.outside = "written"; } catch { result.outside = "refused"; }
try { fs.readFileSync(${JSON.stringify(join(base, "secrets", "key.txt"))}); result.secret = "read"; } catch { result.secret = "hidden"; }
const done = (port) => { result.port = port; console.log(JSON.stringify(result)); process.exit(0); };
const socket = net.connect({ host: "127.0.0.1", port: ${canaryPort} });
socket.on("connect", () => done("connected"));
socket.on("error", () => done("blocked"));
setTimeout(() => done("blocked"), 5000);
`,
    );
    expect(JSON.parse(out.split(/\r?\n/).pop() ?? "")).toEqual({
      variable: "a value with spaces",
      write: "written",
      outside: "refused",
      secret: "hidden",
      port: "blocked",
    });
    expect(connections).toBe(0);
    expect(await readFile(join(work, "made.txt"), "utf8")).toBe("x");
  });

  it("without a bridge, reaches no loopback port, directly or through the proxy", async () => {
    const before = connections;
    const unbridged = await sandbox.open({
      ...profile(),
      network: { bridge: null, allowedSites: [] },
    });
    try {
      expect(unbridged.fence).toEqual({ state: "fenced" });
      const out = await runScript(
        "no-bridge.cjs",
        `const net = require("node:net");
const result = {};
const report = () => { console.log(JSON.stringify(result)); process.exit(0); };
const finish = () => { if ("direct" in result && "proxy" in result) report(); };
process.on("uncaughtException", (error) => { result.error = String(error); report(); });
const socket = net.connect({ host: "127.0.0.1", port: ${canaryPort} });
socket.on("connect", () => { result.direct = "connected"; finish(); });
socket.on("error", () => { result.direct = "blocked"; finish(); });
const proxy = process.env.HTTP_PROXY ?? process.env.http_proxy;
if (proxy === undefined) { result.proxy = "none"; finish(); }
else {
  // srt may name its proxy without a scheme.
  const via = new URL(proxy.includes("://") ? proxy : "http://" + proxy);
  // A raw request, because newer Node's http.request refuses an absolute-URL
  // path for another host than the one it connects to.
  const target = "127.0.0.1:${canaryPort}";
  const proxied = net.connect({ host: via.hostname, port: Number(via.port) || 80 });
  const answer = (outcome) => { if (!("proxy" in result)) { result.proxy = outcome; finish(); } };
  proxied.on("connect", () => proxied.write("GET http://" + target + "/ HTTP/1.1\\r\\nHost: " + target + "\\r\\nConnection: close\\r\\n\\r\\n"));
  proxied.once("data", (data) => answer(/^HTTP\\/1\\.[01] 200 /.test(data.toString("latin1")) ? "reached" : "refused"));
  proxied.on("error", () => answer("refused"));
  proxied.on("close", () => answer("refused"));
}
setTimeout(() => { result.direct ??= "blocked"; result.proxy ??= "refused"; report(); }, 5000);
`,
        unbridged,
      );
      const result = JSON.parse(out.split(/\r?\n/).pop() ?? "");
      expect(result.error).toBeUndefined();
      expect(result.direct).toBe("blocked");
      expect(result.proxy).not.toBe("reached");
      expect(connections).toBe(before);
    } finally {
      await unbridged.close();
    }
  });

  it("gives the exit code of the program", async () => {
    await writeFile(join(work, "exit.cjs"), "process.exit(3);");
    const started = await session.start({
      program: process.execPath,
      args: [join(work, "exit.cjs")],
    });
    expect(await started.exited).toMatchObject({ code: 3, reason: "exited" });
  });

  it("kill ends a program and the process it started", async () => {
    const ticks = join(base, "temp", "ticks");
    const loop = `const fs = require("node:fs");
setInterval(() => fs.writeFileSync(${JSON.stringify(ticks)}, String(Date.now())), 100);`;
    await writeFile(join(work, "loop.cjs"), loop);
    await writeFile(
      join(work, "parent.cjs"),
      `const { spawn } = require("node:child_process");
spawn(process.execPath, [${JSON.stringify(join(work, "loop.cjs"))}], { stdio: "ignore" });
setInterval(() => {}, 1000);`,
    );
    const started = await session.start({
      program: process.execPath,
      args: [join(work, "parent.cjs")],
    });
    const deadline = Date.now() + 20_000;
    let before = await readFile(ticks, "utf8").catch(() => "");
    while (before === "" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      before = await readFile(ticks, "utf8").catch(() => "");
    }
    expect(before).not.toBe("");
    await started.kill();
    expect((await started.exited).reason).toBe("stopped");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const after = await readFile(ticks, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await readFile(ticks, "utf8")).toBe(after);
  });
});
