import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * Attacks against the real fence: a program that tries to get out the ways a
 * misbehaving agent would. Like `srt-fence.test.ts`, these need a machine
 * where the sandbox can start and run with `pnpm test:fence`.
 */
const sandbox = new SrtSandbox();

/** Waits until the file has content; a program writing to it may not have started yet. */
async function waitForContent(path: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await readFile(path, "utf8").catch(() => "")) !== "") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`nothing was written to ${path} within ${timeoutMs} ms`);
}

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

describe("a program trying to get out of the fence", () => {
  let base: string;
  let secret: string;
  let session: SandboxSession;

  const profile = (): SandboxProfile => ({
    workingFolder: join(base, "work"),
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [join(base, "readonly")],
    deniedPaths: [join(base, "secrets")],
    env: { HOME: join(base, "temp") },
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  /** Runs a shell script in the session and gives its output and exit code. */
  async function sh(script: string, target: SandboxSession = session) {
    const started = await target.start({ program: "sh", args: ["-c", script] });
    const [out, exit] = await Promise.all([read(started.stdout), started.exited]);
    return { out, code: exit.code, reason: exit.reason };
  }

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "srt-attack-"));
    secret = join(base, "secrets", "key.txt");
    await mkdir(join(base, "work"), { recursive: true });
    await mkdir(join(base, "secrets"), { recursive: true });
    await mkdir(join(base, "readonly"), { recursive: true });
    await writeFile(secret, "hunter2");
    await writeFile(join(base, "readonly", "docs.txt"), "docs");
    await writeFile(join(base, "outside.txt"), "outside-original");
    session = await sandbox.open(profile());
  });

  afterAll(async () => {
    await session?.close();
    await rm(base, { recursive: true, force: true });
  });

  it("can't read a denied file through a symlink in the working folder", async () => {
    const { out } = await sh(`ln -s ${secret} link && cat link`);
    expect(out).not.toContain("hunter2");
  });

  it("can't read a denied file by copying or hard-linking it in", async () => {
    const { out } = await sh(
      `cp ${secret} copied.txt 2>/dev/null; ln ${secret} hard.txt 2>/dev/null; cat copied.txt hard.txt 2>/dev/null`,
    );
    expect(out).not.toContain("hunter2");
    await expect(readFile(join(base, "work", "copied.txt"), "utf8")).rejects.toThrow();
  });

  it("can't read a denied file through /proc", async () => {
    const { out } = await sh(`cat /proc/self/root${secret}`);
    expect(out).not.toContain("hunter2");
  });

  it("can't list the denied folder to find what is in it", async () => {
    const { out } = await sh(`ls ${join(base, "secrets")}`);
    expect(out).not.toContain("key.txt");
  });

  it("can't write through a symlink that points outside the working folder", async () => {
    const target = join(base, "outside.txt");
    const { code } = await sh(`ln -s ${target} escape && echo changed > escape`);
    expect(code).not.toBe(0);
    expect(await readFile(target, "utf8")).toBe("outside-original");
  });

  it("can't write a read-only path", async () => {
    const { code } = await sh(`echo x > ${join(base, "readonly", "docs.txt")}`);
    expect(code).not.toBe(0);
    expect(await readFile(join(base, "readonly", "docs.txt"), "utf8")).toBe("docs");
  });

  it("can't plant tool hooks in the working folder", async () => {
    const attempts = [
      "mkdir -p .claude && echo {} > .claude/settings.local.json",
      "mkdir -p .codex && echo x > .codex/config.toml",
      "mkdir -p .cursor && echo x > .cursor/rules",
    ];
    for (const attempt of attempts) {
      expect((await sh(attempt)).code).not.toBe(0);
    }
    await expect(stat(join(base, "work", ".claude", "settings.local.json"))).rejects.toThrow();
    await expect(stat(join(base, "work", ".codex"))).rejects.toThrow();
    await expect(stat(join(base, "work", ".cursor"))).rejects.toThrow();
  });

  it("can't make git run a command through a submodule's or a worktree's settings", async () => {
    const repo = join(base, "repo");
    const module = join(repo, ".git", "modules", "docs");
    await mkdir(module, { recursive: true });
    await writeFile(join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(module, "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(module, "config"), "[core]\n");
    const planted = await sandbox.open({ ...profile(), workingFolder: repo });
    try {
      const attempts = [
        "printf '[core]\\n\\tfsmonitor = touch pwned\\n' >> .git/modules/docs/config",
        "mkdir -p .git/modules/docs/hooks && echo x > .git/modules/docs/hooks/post-checkout",
        "echo x > .git/modules/docs/config.worktree",
        "printf '[core]\\n\\tfsmonitor = touch pwned\\n' > .git/config.worktree",
      ];
      for (const attempt of attempts) {
        expect((await sh(attempt, planted)).code).not.toBe(0);
      }
    } finally {
      await planted.close();
    }
    expect(await readFile(join(module, "config"), "utf8")).toBe("[core]\n");
    await expect(stat(join(module, "hooks", "post-checkout"))).rejects.toThrow();
    expect(await readFile(join(repo, ".git", "config.worktree"), "utf8").catch(() => "")).toBe("");
  });

  it("can't make git run a command through a nested clone that is no submodule (HAL-5976)", async () => {
    // Two folders down: deeper than srt's own search denies on Linux.
    const repo = join(base, "with-nested-clone");
    const clone = join(repo, "vendor", "acme", ".git");
    await mkdir(clone, { recursive: true });
    await writeFile(join(clone, "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(clone, "config"), "[core]\n");
    const planted = await sandbox.open({ ...profile(), workingFolder: repo });
    try {
      const attempts = [
        "printf '[core]\\n\\tfsmonitor = touch pwned\\n' >> vendor/acme/.git/config",
        "mkdir -p vendor/acme/.git/hooks && echo x > vendor/acme/.git/hooks/post-checkout",
        "printf '[core]\\n\\tfsmonitor = touch pwned\\n' > vendor/acme/.git/config.worktree",
        "mv vendor/acme vendor/acme-old",
      ];
      for (const attempt of attempts) {
        expect((await sh(attempt, planted)).code).not.toBe(0);
      }
    } finally {
      await planted.close();
    }
    expect(await readFile(join(clone, "config"), "utf8")).toBe("[core]\n");
    await expect(stat(join(clone, "hooks", "post-checkout"))).rejects.toThrow();
    expect(await readFile(join(clone, "config.worktree"), "utf8").catch(() => "")).toBe("");
  });

  it("can't point a linked worktree's .git file at a git folder of its own", async () => {
    const worktree = join(base, "worktree");
    await mkdir(worktree, { recursive: true });
    await writeFile(join(worktree, ".git"), "gitdir: /elsewhere/.git/worktrees/acme\n");
    const planted = await sandbox.open({ ...profile(), workingFolder: worktree });
    try {
      expect((await sh("echo 'gitdir: ./evil' > .git", planted)).code).not.toBe(0);
    } finally {
      await planted.close();
    }
    expect(await readFile(join(worktree, ".git"), "utf8")).toBe(
      "gitdir: /elsewhere/.git/worktrees/acme\n",
    );
  });

  it("can't point a submodule's .git at a git folder of its own, as a file or a folder", async () => {
    const repo = join(base, "with-submodule");
    await mkdir(join(repo, ".git", "modules", "docs"), { recursive: true });
    await mkdir(join(repo, "docs"), { recursive: true });
    await writeFile(join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(repo, ".git", "modules", "docs", "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(repo, ".gitmodules"), '[submodule "docs"]\n\tpath = docs\n');
    await writeFile(join(repo, "docs", ".git"), "gitdir: ../.git/modules/docs\n");
    const planted = await sandbox.open({ ...profile(), workingFolder: repo });
    try {
      const attempts = [
        "echo 'gitdir: ../evil' > docs/.git",
        "rm -f docs/.git && mkdir docs/.git && echo x > docs/.git/config",
        "mv docs docs-old && mkdir docs && echo 'gitdir: ../evil' > docs/.git",
      ];
      for (const attempt of attempts) {
        expect((await sh(attempt, planted)).code).not.toBe(0);
      }
    } finally {
      await planted.close();
    }
    expect(await readFile(join(repo, "docs", ".git"), "utf8")).toBe(
      "gitdir: ../.git/modules/docs\n",
    );
  });

  it("can't reach the network outside the bridge", async () => {
    const { out } = await sh(
      "curl -s --max-time 10 --noproxy '*' http://example.com/ 2>&1; echo \"exit=$?\"",
    );
    expect(out).not.toContain("Example Domain");
  });

  it("can't open a raw connection to a host loopback port, bypassing the proxy", async () => {
    const server = createServer((_request, response) => response.end("host-loopback-body"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const { out } = await sh(
        `curl -s --max-time 5 --noproxy '*' http://127.0.0.1:${port}/ 2>&1; echo "exit=$?"`,
      );
      expect(out).not.toContain("host-loopback-body");
    } finally {
      server.close();
    }
  });

  it("doesn't see the host's environment", async () => {
    process.env["HALONIC_ATTACK_CANARY"] = "canary-value";
    try {
      const { out } = await sh("env");
      // The profile's own variables do arrive, so an empty `env` can't pass this.
      expect(out).toContain(`HOME=${join(base, "temp")}`);
      expect(out).not.toContain("canary-value");
    } finally {
      delete process.env["HALONIC_ATTACK_CANARY"];
    }
  });

  it("kill ends a program that detached itself from the process group", async () => {
    const ticks = join(base, "temp", "detached-ticks");
    const started = await session.start({
      program: "sh",
      args: [
        "-c",
        `(perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' sh -c 'while true; do date +%s%N >> ${ticks}; sleep 0.1; done' &) ; sleep 60`,
      ],
    });
    // The program appends, so the file is never empty between two writes. It runs before the kill.
    await waitForContent(ticks);
    await started.kill();
    await started.exited;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = await readFile(ticks, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await readFile(ticks, "utf8")).toBe(after);
  });

  it("kill ends a program that keeps starting new detached children", async () => {
    const ticks = join(base, "temp", "forking-ticks");
    const worker = join(base, "temp", "forking-worker.sh");
    const spawner = join(base, "temp", "forking-spawner.sh");
    const detach = "perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV'";
    await writeFile(worker, `while true; do date +%s%N >> ${ticks}; sleep 0.1; done\n`);
    await writeFile(spawner, `while true; do (${detach} sh ${worker} &); sleep 0.2; done\n`);
    const started = await session.start({
      program: "sh",
      args: ["-c", `(${detach} sh ${spawner} &) ; sleep 60`],
    });
    await waitForContent(ticks);
    await started.kill();
    await started.exited;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = await readFile(ticks, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await readFile(ticks, "utf8")).toBe(after);
  });

  it("is stopped by the time limit, with everything it started", async () => {
    const limited = await sandbox.open({ ...profile(), timeLimitMs: 3000 });
    try {
      const ticks = join(base, "temp", "limited-ticks");
      const started = await limited.start({
        program: "sh",
        args: ["-c", `(while true; do date +%s%N >> ${ticks}; sleep 0.1; done) & wait`],
      });
      const exit = await started.exited;
      expect(exit.reason).toBe("timeout");
      // The program's end shows before the session finishes shutting down; close waits for that.
      await limited.close();
      expect(limited.fence).toEqual({ state: "stopped" });
      // What the program started in the background has stopped writing too.
      const after = await readFile(ticks, "utf8");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(await readFile(ticks, "utf8")).toBe(after);
    } finally {
      await limited.close();
    }
  });
});
