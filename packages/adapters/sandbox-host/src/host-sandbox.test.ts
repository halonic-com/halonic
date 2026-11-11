import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProcess, SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cantStartCode } from "./host-process.ts";
import { createHostSandbox } from "./host-sandbox.ts";

// Real programs, started by the launcher with no fence. The program is Node
// itself, told what to do with `-e <code>`, so these run on Windows too.

const node = process.execPath;
const windows = process.platform === "win32";
let work = "";

beforeAll(async () => {
  // The real path: on macOS the temp folder is behind a symbolic link, and `process.cwd()` reads through it.
  work = await realpath(await mkdtemp(join(tmpdir(), "hs-start-")));
  await mkdir(join(work, "inner"));
});
afterAll(() => rm(work, { recursive: true, force: true }));

function profile(overrides: Partial<SandboxProfile> = {}): SandboxProfile {
  return {
    workingFolder: work,
    tempFolder: work,
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: { TMPDIR: work },
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 30_000,
    ...overrides,
  };
}

async function text(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

/** Starts Node with `code` and reads its output to the end. */
async function runNode(code: string, overrides: Partial<SandboxProfile> = {}) {
  const session = await createHostSandbox().open(profile(overrides));
  try {
    const program = await session.start({ program: node, args: ["-e", code] });
    const [stdout, exit] = await Promise.all([text(program.stdout), program.exited]);
    return { stdout, exit };
  } finally {
    await session.close();
  }
}

/**
 * What the system adds to every process, whatever environment it is given.
 * On Windows, libuv copies these names from the launcher into every child
 * (its `required_vars`); macOS adds the text encoding.
 */
const addedBySystem = windows
  ? [
      "HOMEDRIVE",
      "HOMEPATH",
      "LOGONSERVER",
      "PATH",
      "SYSTEMDRIVE",
      "SYSTEMROOT",
      "TEMP",
      "USERDOMAIN",
      "USERNAME",
      "USERPROFILE",
      "WINDIR",
    ]
  : ["__CF_USER_TEXT_ENCODING"];

/** Resolves once `pid` is gone, or rejects after a few seconds. */
async function gone(pid: number): Promise<void> {
  // `kill(0)` would signal our own process group, which never goes.
  expect(pid).toBeGreaterThan(0);
  for (let tries = 0; tries < 100; tries++) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`process ${pid} is still running`);
}

/** A program that starts a child of its own, prints the child's id and keeps running. */
const parentOfChild = [
  "const { spawn } = require('node:child_process');",
  "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
  "process.stdout.write(String(child.pid) + '\\n');",
  "setInterval(() => {}, 1000);",
].join("\n");

async function firstLine(program: SandboxProcess): Promise<string> {
  const reader = program.stdout.getReader();
  let seen = "";
  while (!seen.includes("\n")) {
    const { value, done } = await reader.read();
    if (done) break;
    seen += new TextDecoder().decode(value);
  }
  reader.releaseLock();
  return seen.trim();
}

verifies("sandbox-host.start", () => {
  describe("the launcher as a sandbox without a fence", () => {
    it("says it works, has no fence, and reports its sessions as off until closed", async () => {
      const sandbox = createHostSandbox();
      expect(await sandbox.check()).toEqual({ ok: true, reason: null, missing: [] });
      expect(sandbox.capabilities()).toEqual({ files: "shared", strength: "none" });
      const session = await sandbox.open(profile());
      expect(session.fence).toEqual({ state: "off" });
      await session.close();
      expect(session.fence).toEqual({ state: "stopped" });
      await expect(session.start({ program: node, args: ["-e", ""] })).rejects.toThrow(
        "the sandbox session is closed",
      );
    });

    it("gives the program only the profile's variables, never the launcher's", async () => {
      process.env["HALONIC_TEST_TOKEN"] = "not-for-the-program";
      try {
        const { stdout, exit } = await runNode(
          "process.stdout.write(JSON.stringify(Object.keys(process.env)))",
        );
        expect(exit).toEqual({ code: 0, signal: null, reason: "exited" });
        const names = (JSON.parse(stdout) as string[]).filter(
          (name) => !addedBySystem.includes(windows ? name.toUpperCase() : name),
        );
        expect(names).toEqual(["TMPDIR"]);
      } finally {
        delete process.env["HALONIC_TEST_TOKEN"];
      }
    });

    it("carries standard input to the program and its output back", async () => {
      const session = await createHostSandbox().open(profile());
      const program = await session.start({
        program: node,
        args: ["-e", "process.stdin.pipe(process.stdout)"],
      });
      const writer = program.stdin.getWriter();
      await writer.write(new TextEncoder().encode("ping"));
      await writer.close();
      expect(await text(program.stdout)).toBe("ping");
      expect((await program.exited).code).toBe(0);
      await session.close();
    });

    it("starts in the working folder, or a folder inside it, and nowhere else", async () => {
      expect((await runNode("process.stdout.write(process.cwd())")).stdout).toBe(work);
      const session = await createHostSandbox().open(profile());
      const inner = await session.start({
        program: node,
        args: ["-e", "process.stdout.write(process.cwd())"],
        cwd: "inner",
      });
      expect(await text(inner.stdout)).toBe(join(work, "inner"));
      await expect(session.start({ program: node, args: [], cwd: ".." })).rejects.toThrow(
        "the program must start inside the working folder",
      );
      await session.close();
    });

    it("ends a program it can't find with a non-zero code instead of throwing", async () => {
      const session = await createHostSandbox().open(profile({ env: { PATH: work } }));
      for (const name of ["no-such-program", "./no-such-program"]) {
        const program = await session.start({ program: name, args: [] });
        expect(await program.exited).toEqual({
          code: cantStartCode,
          signal: null,
          reason: "exited",
        });
        expect(await text(program.stdout)).toBe("");
      }
      await session.close();
    });

    it("stops a killed program and the child it started", async () => {
      const session = await createHostSandbox().open(profile());
      const program = await session.start({ program: node, args: ["-e", parentOfChild] });
      const child = Number(await firstLine(program));
      await program.kill();
      expect((await program.exited).reason).toBe("stopped");
      await gone(child);
      await session.close();
    });

    // Windows ties no tree to a program that has ended, so there the child keeps it open (README).
    it.skipIf(windows)(
      "[platform:win32] has no process groups: ends as soon as the program does, even when a child it left holds its output open",
      async () => {
        const leavesChild = [
          "const { spawn } = require('node:child_process');",
          "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });",
          "process.stdout.write(String(child.pid) + '\\n', () => process.exit(0));",
        ].join("\n");
        const session = await createHostSandbox().open(profile());
        const program = await session.start({ program: node, args: ["-e", leavesChild] });
        const child = Number(await firstLine(program));
        // Well inside the session's 30 s, which is when it would end if the child kept it open.
        const exit = await Promise.race([
          program.exited,
          new Promise((resolve) => setTimeout(() => resolve("still running"), 10_000)),
        ]);
        expect(exit).toEqual({ code: 0, signal: null, reason: "exited" });
        await gone(child);
        await session.close();
      },
      15_000,
    );

    it("stops its programs when the time limit runs out", async () => {
      // Long enough for Node to start twice and print the child's id on a busy runner.
      const session = await createHostSandbox().open(profile({ timeLimitMs: 3_000 }));
      const program = await session.start({ program: node, args: ["-e", parentOfChild] });
      const child = Number(await firstLine(program));
      expect((await program.exited).reason).toBe("timeout");
      await gone(child);
      expect(session.fence).toEqual({ state: "stopped" });
    }, 15_000);

    it("closes when the open signal aborts, and refuses to open on one already aborted", async () => {
      const controller = new AbortController();
      const session = await createHostSandbox().open(profile(), { signal: controller.signal });
      const program = await session.start({
        program: node,
        args: ["-e", "setInterval(() => {}, 1000)"],
      });
      controller.abort();
      expect((await program.exited).reason).toBe("stopped");
      expect(session.fence).toEqual({ state: "stopped" });
      await expect(
        createHostSandbox().open(profile(), { signal: AbortSignal.abort() }),
      ).rejects.toThrow();
    });

    it("refuses a bridge that is not a loopback address, as every adapter does", async () => {
      const network = { bridge: { host: "example.com", port: 80 }, allowedSites: [] };
      await expect(createHostSandbox().open(profile({ network }))).rejects.toThrow(
        "the bridge must be a loopback address",
      );
    });

    it("reports no blocked accesses, because nothing is fenced off", async () => {
      const session = await createHostSandbox().open(profile());
      const blocks: unknown[] = [];
      const stop = session.onBlocked((block) => blocks.push(block));
      await (await session.start({ program: node, args: ["-e", "require('node:os').homedir()"] }))
        .exited;
      stop();
      expect(blocks).toEqual([]);
      await session.close();
    });
  });
});
