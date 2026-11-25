import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * The canary for OpenCode's private server (HAL-16833): on Linux, srt gives
 * the fence a network namespace of its own, so `127.0.0.1` inside it is the
 * fence's loopback, not the host's. OpenCode's `--standalone` server listens
 * there, and the OpenCode harness runs only on Linux because of it
 * (`harness-opencode.refusals`).
 *
 * The host and the fence each bind the same port on `127.0.0.1` and answer
 * with their own body. A request from inside the fence must get the fence's
 * body, never the host's: directly, with every proxy turned off, and through
 * srt's proxy, which may also refuse it. Should srt ever share the host's loopback, the fence can't
 * bind the port, or the host's body comes back, and this test fails.
 * Run with `pnpm test:fence`.
 */
const onLinux = process.platform === "linux";
const sandbox = new SrtSandbox();

const hostBody = "host-body";
const innerBody = "inner-body";

/**
 * The program run inside the fence: it serves {@link innerBody} on
 * `127.0.0.1:<port>`, asks for it with curl in each of the three ways, and
 * prints one JSON line with what each got.
 */
const innerProgram = `
const { createServer } = require("node:http");
const { execFileSync } = require("node:child_process");
const port = Number(process.argv[2]);
const url = "http://127.0.0.1:" + port + "/";
const fetchWith = (args) => {
  try {
    return execFileSync("curl", ["-s", "--max-time", "10", ...args, url], { encoding: "utf8" });
  } catch (error) {
    return "refused: curl exit " + error.status;
  }
};
const server = createServer((request, response) => response.end(${JSON.stringify(innerBody)}));
server.on("error", (error) => {
  console.log(JSON.stringify({ bindError: error.code }));
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  const proxy = process.env.HTTP_PROXY || process.env.http_proxy || "";
  const got = {
    direct: fetchWith([]),
    noProxy: fetchWith(["--noproxy", "*"]),
    throughProxy: proxy === "" ? "no HTTP_PROXY" : fetchWith(["--proxy", proxy, "--noproxy", ""]),
  };
  console.log(JSON.stringify(got));
  server.close();
});
`;

/** What {@link innerProgram} prints: the body, or why there was none, for each way it asked. */
interface InnerResult {
  direct: string;
  noProxy: string;
  throughProxy: string;
}

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

describe.skipIf(!onLinux)("the fence's own loopback under srt", () => {
  let base: string;
  let hostServer: Server;
  let port: number;
  let session: SandboxSession;

  const profile = (): SandboxProfile => ({
    workingFolder: join(base, "work"),
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: { HOME: join(base, "temp") },
    network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "srt-own-loopback-"));
    await mkdir(join(base, "work"), { recursive: true });
    await mkdir(join(base, "temp"), { recursive: true });
    await writeFile(join(base, "work", "inner.cjs"), innerProgram);
    hostServer = createServer((_request, response) => response.end(hostBody));
    await new Promise<void>((resolve) => hostServer.listen(0, "127.0.0.1", resolve));
    port = (hostServer.address() as AddressInfo).port;
    session = await sandbox.open(profile());
  });

  afterAll(async () => {
    await session?.close();
    await new Promise((resolve) => hostServer?.close(resolve));
    await rm(base, { recursive: true, force: true });
  });

  it("proves the fence", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it("binds the host's port again inside, and every request there gets the fence's body", async () => {
    const started = await session.start({
      program: process.execPath,
      args: [join(base, "work", "inner.cjs"), String(port)],
    });
    const [out, exit] = await Promise.all([read(started.stdout), started.exited]);

    expect(exit, out).toMatchObject({ code: 0, reason: "exited" });
    const got = JSON.parse(out.trim().split("\n").at(-1) ?? "{}") as InnerResult;
    expect(got.direct).toBe(innerBody);
    expect(got.noProxy).toBe(innerBody);
    // srt's proxy may refuse a loopback address, which is safe too; it must never reach the host's server.
    expect(got.throughProxy).not.toBe(hostBody);
    expect(
      got.throughProxy === innerBody || got.throughProxy.startsWith("refused:"),
      got.throughProxy,
    ).toBe(true);
  });

  it("leaves the host's server answering with its own body", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(await response.text()).toBe(hostBody);
  });
});
