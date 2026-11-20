import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxBlock, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * The network requests srt's proxy refuses reach the session's listeners
 * (HAL-12648), on the real fence: the run page's Blocked sites panel is built
 * from them. A program asks through the proxy srt sets inside the fence, with
 * curl, for a site the profile doesn't allow and for the bridge it does.
 * Needs a machine where srt can start, like the other tests in `fence/`.
 */
const sandbox = new SrtSandbox();

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

describe("network requests srt's proxy refuses, on the real fence", () => {
  let base: string;
  let bridge: Server;
  let session: SandboxSession;
  const blocks: SandboxBlock[] = [];

  /** Asks for `url` through the fence's proxy and returns the body, empty when refused. */
  async function ask(url: string): Promise<string> {
    const started = await session.start({
      program: "sh",
      args: ["-c", `curl -s --max-time 10 --noproxy '' -x "$HTTP_PROXY" ${url}`],
    });
    const [body] = await Promise.all([read(started.stdout), read(started.stderr)]);
    await started.exited;
    return body.trim();
  }

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "srt-network-report-"));
    await mkdir(join(base, "work"), { recursive: true });
    bridge = await new Promise<Server>((resolve) => {
      const server = createServer((_request, response) => response.end("bridge"));
      server.listen(0, "127.0.0.1", () => resolve(server));
    });
    session = await sandbox.open({
      workingFolder: join(base, "work"),
      tempFolder: join(base, "temp"),
      settingsFolder: null,
      readOnlyPaths: [],
      deniedPaths: [],
      env: { HOME: join(base, "temp") },
      network: {
        bridge: {
          kind: "loopback",
          host: "127.0.0.1",
          port: (bridge.address() as AddressInfo).port,
        },
        allowedSites: [],
      },
      timeLimitMs: 120_000,
    });
    session.onBlocked((block) => blocks.push(block));
  });

  beforeEach(() => {
    blocks.length = 0;
  });

  afterAll(async () => {
    await session?.close();
    bridge?.close();
    await rm(base, { recursive: true, force: true });
  });

  it("reports a site the profile doesn't allow, with the port asked for", async () => {
    expect(await ask("http://blocked.example/")).not.toBe("bridge");
    expect(blocks).toEqual([{ kind: "network", host: "blocked.example", port: 80 }]);
  });

  it("reports nothing for the bridge, which the proxy lets through", async () => {
    const { port } = bridge.address() as AddressInfo;
    expect(await ask(`http://127.0.0.1:${port}/`)).toBe("bridge");
    expect(blocks).toEqual([]);
  });
});
