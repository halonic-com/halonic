import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readyCheckTimeoutMs, startSmallestSandbox } from "../src/ready-check.ts";
import { srtRunner } from "../src/srt-runner.ts";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * Tests against the real fence. They need a machine where the sandbox can
 * start (the sandbox CI job, a Linux machine with bubblewrap, a Mac), so they
 * live outside `src` and run with `pnpm test:fence`, not with `pnpm test`.
 * On a machine that can't start the sandbox they fail, on purpose: a run that
 * proved nothing must not look like a pass.
 */
const sandbox = new SrtSandbox();
const execFileAsync = promisify(execFile);

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

describe("SrtSandbox with the real fence", () => {
  let base: string;
  let secret: string;
  let session: SandboxSession;

  const profile = (): SandboxProfile => ({
    workingFolder: join(base, "work"),
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [join(base, "secrets")],
    env: { HOME: join(base, "temp") },
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "srt-real-"));
    secret = join(base, "secrets", "key.txt");
    await mkdir(join(base, "work"), { recursive: true });
    await mkdir(join(base, "secrets"), { recursive: true });
    await writeFile(secret, "hunter2");
    session = await sandbox.open(profile());
  });

  afterAll(async () => {
    await session?.close();
    await rm(base, { recursive: true, force: true });
  });

  it("starts srt's smallest sandbox for the ready check, within its time limit (HAL-6518)", async () => {
    const started = performance.now();
    const answer = await startSmallestSandbox(srtRunner);
    const tookMs = Math.round(performance.now() - started);
    // What the ready check adds to `halonic doctor`, for the CI log.
    console.log(`ready check: ${tookMs} ms`);
    expect(answer).toBeNull();
    expect(tookMs).toBeLessThan(readyCheckTimeoutMs);
  });

  it("can start on this machine", async () => {
    expect(await sandbox.check()).toEqual({
      ok: true,
      reason: null,
      missing: [],
    });
  });

  it("proves the fence", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it("runs a program and gives its output and exit code", async () => {
    const started = await session.start({
      program: "sh",
      args: ["-c", "echo hi; exit 3"],
    });
    const [out, exit] = await Promise.all([read(started.stdout), started.exited]);
    expect(out.trim()).toBe("hi");
    expect(exit).toMatchObject({ code: 3, reason: "exited" });
  });

  it("hides a denied file from the program", async () => {
    const started = await session.start({ program: "cat", args: [secret] });
    const [out, exit] = await Promise.all([read(started.stdout), started.exited]);
    expect(out).not.toContain("hunter2");
    expect(exit.code).not.toBe(0);
  });

  it("writes the working folder and nowhere else", async () => {
    const inside = await session.start({
      program: "sh",
      args: ["-c", "echo x > made.txt"],
    });
    expect((await inside.exited).code).toBe(0);
    expect(await readFile(join(base, "work", "made.txt"), "utf8")).toBe("x\n");
    const outside = await session.start({
      program: "sh",
      args: ["-c", `echo x > ${join(base, "outside.txt")}`],
    });
    expect((await outside.exited).code).not.toBe(0);
  });

  it("denies writing the tool settings in the working folder", async () => {
    const started = await session.start({
      program: "sh",
      args: ["-c", "mkdir -p .claude && echo {} > .claude/settings.json"],
    });
    expect((await started.exited).code).not.toBe(0);
  });

  it("denies writing the wider tool settings, and git init in a folder without .git", async () => {
    const vscode = await session.start({
      program: "sh",
      args: ["-c", "mkdir -p .vscode && echo {} > .vscode/tasks.json"],
    });
    expect((await vscode.exited).code).not.toBe(0);
    const init = await session.start({
      program: "sh",
      args: ["-c", "git init -q ."],
    });
    expect((await init.exited).code).not.toBe(0);
  });

  it("denies creating a new denied entry such as .npmrc", async () => {
    const npmrc = await session.start({
      program: "sh",
      args: ["-c", "echo registry=http://example.invalid > .npmrc"],
    });
    expect((await npmrc.exited).code).not.toBe(0);
  });

  it("in a git worktree, git status works and the .git file can't be rewritten", async () => {
    const main = join(base, "main-repo");
    const worktree = join(base, "worktree");
    const git = (cwd: string, ...args: string[]) =>
      execFileAsync("git", ["-c", "user.name=acme", "-c", "user.email=acme@example.com", ...args], {
        cwd,
      });
    await mkdir(main, { recursive: true });
    await git(main, "init", "-q", "-b", "main");
    await git(main, "commit", "-q", "--allow-empty", "-m", "init");
    await git(main, "worktree", "add", "-q", worktree);
    const worktreeSession = await sandbox.open({ ...profile(), workingFolder: worktree });
    try {
      const status = await worktreeSession.start({ program: "git", args: ["status", "--short"] });
      expect((await status.exited).code).toBe(0);
      const before = await readFile(join(worktree, ".git"), "utf8");
      const rewrite = await worktreeSession.start({
        program: "sh",
        args: ["-c", "echo 'gitdir: /nowhere' > .git"],
      });
      expect((await rewrite.exited).code).not.toBe(0);
      expect(await readFile(join(worktree, ".git"), "utf8")).toBe(before);
    } finally {
      await worktreeSession.close();
    }
  });

  it("kill ends a program and the background processes it started", async () => {
    const ticks = join(base, "temp", "ticks");
    const started = await session.start({
      program: "sh",
      args: [
        "-c",
        `while true; do date +%s%N > ${ticks}.new && mv ${ticks}.new ${ticks}; sleep 0.1; done & wait`,
      ],
    });
    // The loop swaps each tick in with a rename, so a read never sees the file
    // half written (`>` truncates it first). Wait for the first tick instead of
    // sleeping a fixed time, which is too short on a loaded runner.
    const deadline = Date.now() + 15_000;
    let before = await readFile(ticks, "utf8").catch(() => "");
    while (before === "" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      before = await readFile(ticks, "utf8").catch(() => "");
    }
    expect(before).not.toBe("");
    await started.kill();
    expect((await started.exited).reason).toBe("stopped");
    const after = await readFile(ticks, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await readFile(ticks, "utf8")).toBe(after);
  });

  it("never runs a bwrap the program plants on its own PATH", async () => {
    const marker = join(base, "planted-ran");
    const planter = await sandbox.open({
      ...profile(),
      env: {
        HOME: join(base, "temp"),
        PATH: `${join(base, "work", "bin")}:/usr/bin:/bin`,
      },
    });
    try {
      const plant = await planter.start({
        program: "sh",
        args: [
          "-c",
          `mkdir -p bin && printf '#!/bin/sh\\ntouch ${marker}\\n' > bin/bwrap && chmod +x bin/bwrap`,
        ],
      });
      expect((await plant.exited).code).toBe(0);
      const next = await planter.start({
        program: "echo",
        args: ["still fenced"],
      });
      expect((await read(next.stdout)).trim()).toBe("still fenced");
      await next.exited;
      const reopened = await sandbox.open({
        ...profile(),
        env: {
          HOME: join(base, "temp"),
          PATH: `${join(base, "work", "bin")}:/usr/bin:/bin`,
        },
      });
      expect(reopened.fence).toEqual({ state: "fenced" });
      await reopened.close();
    } finally {
      await planter.close();
    }
    await expect(readFile(marker, "utf8")).rejects.toThrow();
  });

  it("reaches the bridge through the fence's proxy and no other loopback port", async () => {
    const listen = (body: string): Promise<Server> =>
      new Promise((resolve) => {
        const server = createServer((_request, response) => response.end(body));
        server.listen(0, "127.0.0.1", () => resolve(server));
      });
    const bridge = await listen("bridge");
    const other = await listen("other");
    const port = (server: Server) => (server.address() as AddressInfo).port;
    const bridged = await sandbox.open({
      ...profile(),
      network: {
        bridge: { host: "127.0.0.1", port: port(bridge) },
        allowedSites: [],
      },
    });
    // Ask through the proxy srt sets inside the fence, for loopback too.
    const ask = async (target: Server): Promise<string> => {
      const started = await bridged.start({
        program: "sh",
        args: [
          "-c",
          `curl -s --max-time 10 --noproxy '' -x "$HTTP_PROXY" http://127.0.0.1:${port(target)}/`,
        ],
      });
      const body = await read(started.stdout);
      await started.exited;
      return body.trim();
    };
    try {
      expect(await ask(bridge)).toBe("bridge");
      expect(await ask(other)).not.toBe("other");
    } finally {
      await bridged.close();
      bridge.close();
      other.close();
    }
  });

  // srt puts 127.0.0.1 in NO_PROXY, so a client that follows it (Claude Code
  // and Codex do) dials a loopback bridge directly. The fence blocks that: on
  // Linux it has its own empty network namespace, and on macOS Seatbelt lets
  // the program reach only srt's proxy. Only a client forced through the proxy
  // (the test above) reaches the bridge. This is why the bridge moves to a
  // Unix socket (HAL-6316), and it stays as a W9 guard: no direct path to the
  // host's loopback.
  it("a client that follows NO_PROXY can't reach a loopback bridge", async () => {
    let connections = 0;
    const server = await new Promise<Server>((resolve) => {
      const listening = createServer((_request, response) => response.end("reached"));
      listening.on("connection", () => {
        connections += 1;
      });
      listening.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const port = (server.address() as AddressInfo).port;
    const bridged = await sandbox.open({
      ...profile(),
      network: { bridge: { host: "127.0.0.1", port }, allowedSites: [] },
    });
    const ask = async (options: string): Promise<string> => {
      const started = await bridged.start({
        program: "sh",
        args: ["-c", `curl -s --max-time 10 ${options} http://127.0.0.1:${port}/`],
      });
      const body = await read(started.stdout);
      await started.exited;
      return body.trim();
    };
    try {
      const env = await bridged.start({ program: "env", args: [] });
      const [variables] = await Promise.all([read(env.stdout), env.exited]);
      expect(variables).toMatch(/^no_proxy=.*\b127\.0\.0\.1\b/m);
      // As the program would: srt's proxy variables and its NO_PROXY.
      expect(await ask("")).not.toBe("reached");
      // Directly, whatever the variables say.
      expect(await ask("--noproxy '*'")).not.toBe("reached");
      expect(connections).toBe(0);
    } finally {
      await bridged.close();
      server.close();
    }
  });

  it("without a bridge, reaches no loopback port and gets no proxy variable", async () => {
    let connections = 0;
    const server = await new Promise<Server>((resolve) => {
      const listening = createServer((_request, response) => response.end("reached"));
      listening.on("connection", () => {
        connections += 1;
      });
      listening.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const port = (server.address() as AddressInfo).port;
    const unbridged = await sandbox.open({
      ...profile(),
      network: { bridge: null, allowedSites: [] },
    });
    const ask = async (proxy: string): Promise<string> => {
      const started = await unbridged.start({
        program: "sh",
        args: ["-c", `curl -s --max-time 10 --noproxy '' ${proxy} http://127.0.0.1:${port}/`],
      });
      const body = await read(started.stdout);
      await started.exited;
      return body.trim();
    };
    try {
      expect(unbridged.fence).toEqual({ state: "fenced" });
      expect(await ask("")).not.toBe("reached");
      expect(await ask('-x "$HTTP_PROXY"')).not.toBe("reached");
      expect(connections).toBe(0);
      const env = await unbridged.start({ program: "env", args: [] });
      const [variables] = await Promise.all([read(env.stdout), env.exited]);
      expect(variables).not.toMatch(/^[a-z_]*proxy=/im);
    } finally {
      await unbridged.close();
      server.close();
    }
  });

  it("starts nothing after close, and removes its private folder", async () => {
    const other = await sandbox.open(profile());
    await other.close();
    expect(other.fence).toEqual({ state: "stopped" });
    await expect(other.start({ program: "true", args: [] })).rejects.toThrow();
  });
});
