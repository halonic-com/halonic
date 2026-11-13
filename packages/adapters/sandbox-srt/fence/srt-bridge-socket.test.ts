import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { NodeHarnessBridgeServer, socketBridgeName } from "@halonicjs/adapter-harness-bridge";
import {
  type HarnessBridgeOptions,
  harnessBridgeTokenHeader,
  type OpenHarnessBridge,
  type SandboxProfile,
  type SandboxSession,
} from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";
import { w9Violations } from "./own-sockets.test-helper.ts";

/**
 * The harness bridge's Unix socket (HAL-6316, W9) tried from inside the real
 * fence, with the real bridge server and a fake provider: the program reaches
 * the bridge only by its name through srt's proxy, and nothing of ours listens
 * on a port or an abstract socket another program could open. The bridge's own
 * checks are tried one by one in `harness-bridge`'s tests; here they run again
 * where srt's proxy rewrites the request on its way. Run with `pnpm test:fence`.
 */
const sandbox = new SrtSandbox();
const onLinux = process.platform === "linux";

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

/** Stands in for the parts of a run that only the routes for tools and approvals use. */
async function notUsed(): Promise<never> {
  throw new Error("The fence test doesn't use this part of the run.");
}

const messages = JSON.stringify({
  model: "claude-test",
  max_tokens: 1,
  messages: [{ role: "user", content: "hi" }],
});

describe("the harness bridge on a Unix socket", () => {
  let base: string;
  let providerCalls: string[];
  /** While set, the fake provider waits for it before it answers. */
  let hold: Promise<void> | undefined;
  let bridge: OpenHarnessBridge;
  let session: SandboxSession;
  let closed = false;

  const run = (): HarnessBridgeOptions => ({
    runId: "run_fence",
    agentId: "writer",
    providers: { anthropic: { kind: "key", secret: "anthropic-key" } },
    price: () => null,
    recorder: { record: async () => {} },
    tools: { list: notUsed, check: notUsed, call: notUsed },
    approvals: { request: notUsed },
  });

  const profile = (): SandboxProfile => ({
    workingFolder: join(base, "work"),
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [join(base, "bridges")],
    env: { HOME: join(base, "temp") },
    network: {
      bridge: { kind: "socket", name: socketBridgeName, socketPath: bridge.socketPath ?? "" },
      allowedSites: [],
    },
    timeLimitMs: 120_000,
  });

  /** Waits until `done` holds, and fails after five seconds. */
  async function waitFor(done: () => boolean): Promise<void> {
    for (let waited = 0; !done(); waited += 20) {
      if (waited >= 5_000) throw new Error("the request never reached the bridge");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /** Runs `curl` in the fence with `args` and gives the status it got (`000` when it got none) and the body. */
  async function reply(...args: string[]): Promise<{ code: string; body: string }> {
    const started = await session.start({
      program: "curl",
      args: ["-s", "-w", "\\n%{http_code}\\n", "--max-time", "10", ...args],
    });
    const [out] = await Promise.all([read(started.stdout), started.exited]);
    const lines = out.trimEnd().split("\n");
    return { code: lines.pop() ?? "", body: lines.join("\n").trim() };
  }

  /** Runs `curl` in the fence with `args` and gives the status it got: `000` when it got none. */
  async function status(...args: string[]): Promise<string> {
    return (await reply(...args)).code;
  }

  const url = (path = "/v1/messages", host = socketBridgeName) => `http://${host}${path}`;
  const withToken = (): string[] => ["-H", `${harnessBridgeTokenHeader}: ${bridge.token}`];
  const post = (): string[] => [
    "-X",
    "POST",
    "-H",
    "content-type: application/json",
    "-d",
    messages,
  ];

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "srt-bridge-"));
    await mkdir(join(base, "work"), { recursive: true });
    await mkdir(join(base, "temp"), { recursive: true });
    await mkdir(join(base, "bridges"), { mode: 0o700 });
    providerCalls = [];
    const server = new NodeHarnessBridgeServer({
      secrets: { get: async () => "anthropic-test-value" },
      socketFolder: join(base, "bridges"),
      fetch: async (input) => {
        providerCalls.push(String(input));
        await hold;
        return new Response('{"type":"message"}', {
          headers: { "content-type": "application/json" },
        });
      },
    });
    bridge = await server.open(run());
    session = await sandbox.open(profile());
  });

  afterAll(async () => {
    await session?.close();
    if (!closed) await bridge?.close();
    await rm(base, { recursive: true, force: true });
  });

  it("serves its socket in a folder only this user can open", async () => {
    const folder = dirname(bridge.socketPath ?? "");
    const info = await stat(folder);
    expect(info.isDirectory()).toBe(true);
    expect(info.mode & 0o777).toBe(0o700);
    expect(info.uid).toBe(process.getuid?.());
    expect((await stat(bridge.socketPath ?? "")).isSocket()).toBe(true);
    expect(bridge.url).toBe(`http://${socketBridgeName}`);
  });

  it.skipIf(!onLinux)(
    "leaves no TCP or UDP listener and no abstract socket in our processes, while the fence serves a request",
    async () => {
      // The fake provider answers at once, so hold it open until the check has run.
      let release = (): void => {};
      hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const before = providerCalls.length;
      const slow = await session.start({
        program: "curl",
        args: ["-s", "-o", "/dev/null", "--max-time", "10", url(), ...post(), ...withToken()],
      });
      try {
        await waitFor(() => providerCalls.length > before);
        expect(await w9Violations(process.pid)).toEqual([]);
      } finally {
        release();
        hold = undefined;
      }
      await slow.exited;
      expect(await w9Violations(process.pid)).toEqual([]);
    },
  );

  it("serves the program's request through srt's proxy, and through a tunnel to the name", async () => {
    const before = providerCalls.length;
    // A 502 comes from srt's proxy, not the bridge; its body says which hop failed, so a flake explains itself (HAL-8158).
    for (const tunnel of [[], ["-p"]]) {
      const { code, body } = await reply(...tunnel, url(), ...post(), ...withToken());
      expect(code, `${tunnel.join(" ") || "no tunnel"}: ${body}`).toBe("200");
    }
    expect(providerCalls).toHaveLength(before + 2);
  });

  describe("what never reaches the bridge", () => {
    it("is a request to any other name or port, which srt refuses itself", async () => {
      const before = providerCalls.length;
      for (const target of [
        url("/v1/messages", "other.halonic.invalid"),
        url("/v1/messages", `x.${socketBridgeName}`),
        url("/v1/messages", `${socketBridgeName}:443`),
        url("/v1/messages", `${socketBridgeName}:8080`),
        url("/v1/messages", "api.anthropic.com"),
      ]) {
        for (const tunnel of [[], ["-p"]]) {
          const code = await status(...tunnel, target, ...post(), ...withToken());
          expect(code, target).not.toMatch(/^2/);
        }
      }
      expect(providerCalls).toHaveLength(before);
    });

    it("is a CONNECT to another target, through srt or inside a tunnel to the name", async () => {
      const before = providerCalls.length;
      // Through srt's proxy: another target isn't on its list.
      expect(await status("-p", "https://other.example/")).not.toMatch(/^2/);
      // Inside a tunnel srt accepted, the bridge itself refuses it.
      for (const target of ["other.example:443", `${socketBridgeName}:443`]) {
        expect(
          await status("-p", "-X", "CONNECT", "--request-target", target, url("/"), ...withToken()),
          target,
        ).toBe("421");
      }
      expect(providerCalls).toHaveLength(before);
    });

    it("is a program opening the socket file itself", async () => {
      const before = providerCalls.length;
      const code = await status(
        "--unix-socket",
        bridge.socketPath ?? "",
        "http://localhost/v1/messages",
        ...post(),
        ...withToken(),
      );
      expect(code).toBe("000");
      expect(providerCalls).toHaveLength(before);
    });
  });

  // Only inside a tunnel: srt passes those bytes on as they are. Outside one, its proxy
  // writes the request again from the address, so a Host header the program sets is not
  // the one the bridge sees.
  describe("the Host, Origin and token checks, over the socket", () => {
    it("answer 421 to another Host, in the request and inside a tunnel", async () => {
      const before = providerCalls.length;
      for (const host of ["other.example", `${socketBridgeName}.`, `${socketBridgeName}:8080`]) {
        for (const tunnel of [["-p"]]) {
          const code = await status(
            ...tunnel,
            url(),
            ...post(),
            ...withToken(),
            "-H",
            `Host: ${host}`,
          );
          expect(code, host).toBe("421");
        }
      }
      expect(providerCalls).toHaveLength(before);
    });

    it("answer 403 to a request with an Origin and 401 to one without the token", async () => {
      const before = providerCalls.length;
      for (const tunnel of [["-p"]]) {
        expect(
          await status(
            ...tunnel,
            url(),
            ...post(),
            ...withToken(),
            "-H",
            "Origin: http://evil.example",
          ),
        ).toBe("403");
        expect(await status(...tunnel, url(), ...post())).toBe("401");
        expect(
          await status(...tunnel, url(), ...post(), "-H", `${harnessBridgeTokenHeader}: wrong`),
        ).toBe("401");
      }
      expect(providerCalls).toHaveLength(before);
    });

    it("apply to every request inside a tunnel, not only the first", async () => {
      const before = providerCalls.length;
      const started = await session.start({
        program: "curl",
        args: [
          "-s",
          "-o",
          "/dev/null",
          "-w",
          "%{http_code}\\n",
          "--max-time",
          "10",
          "-p",
          url(),
          ...post(),
          ...withToken(),
          "--next",
          "-s",
          "-o",
          "/dev/null",
          "-w",
          "%{http_code}\\n",
          "--max-time",
          "10",
          "-p",
          url(),
          ...post(),
          "--next",
          "-s",
          "-o",
          "/dev/null",
          "-w",
          "%{http_code}\\n",
          "--max-time",
          "10",
          "-p",
          url(),
          ...post(),
          ...withToken(),
          "-H",
          "Origin: http://evil.example",
        ],
      });
      const [out] = await Promise.all([read(started.stdout), started.exited]);
      expect(out.trim().split("\n")).toEqual(["200", "401", "403"]);
      expect(providerCalls).toHaveLength(before + 1);
    });
  });

  it("is gone, socket and folder, once the bridge closes", async () => {
    const socketPath = bridge.socketPath ?? "";
    const folder = dirname(socketPath);
    await session.close();
    await bridge.close();
    closed = true;
    await expect(stat(socketPath)).rejects.toThrow();
    await expect(stat(folder)).rejects.toThrow();
    // Only the socket folder we made is left, empty.
    expect((await stat(dirname(folder))).isDirectory()).toBe(true);
  });
});
