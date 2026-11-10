import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Runner, RunningProgram, RunRequest } from "./srt-runner.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { launcherEnv, programEnv } from "./srt-session.ts";

const linux = {
  platform: "linux" as const,
  insideContainer: async () => false,
  hasBubblewrap: async () => true,
  userNamespacesRestricted: async () => false,
  hasSeatbelt: async () => true,
};

type Exit = { code: number | null; signal: string | null };

/** A program a test controls: it ends when `end` is called or it is killed. */
interface FakeRun {
  request: RunRequest;
  killed: boolean;
  end(code: number | null): void;
  program: RunningProgram;
}

function stream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (text !== "") controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

/** How the fake fence answers the fence probe. */
interface Probe {
  control: string;
  canary: string;
  port: string;
  /** Really connects to the canary port, as a leaking fence would let a program do. */
  leak?: boolean;
  /** Writes this instead of a report. */
  garbage?: string;
  launchFails?: boolean;
}

const fenced: Probe = { control: "readable", canary: "hidden", port: "blocked" };

/** A runner whose probe answers as told and whose other programs the test ends. */
function fakeRunner(probe: Probe = fenced) {
  const runs: FakeRun[] = [];
  const probes: RunRequest[] = [];
  const runner: Runner = {
    async run(request) {
      if (request.args[0] === "-e") {
        probes.push(request);
        if (probe.launchFails) throw new Error("spawn bwrap ENOENT");
        if (probe.leak) {
          const port = Number(request.args[4]);
          await new Promise<void>((resolve) => {
            // The canary server hangs up on whoever it reaches, so waiting for
            // the close means it has already seen this connection.
            const socket = connect({ host: "127.0.0.1", port });
            socket.on("error", () => {});
            socket.on("close", () => resolve());
          });
        }
        return {
          stdin: new WritableStream(),
          stdout: stream(probe.garbage ?? `${JSON.stringify(probe)}\n`),
          stderr: stream(""),
          ended: Promise.resolve({ code: 0, signal: null }),
          killTree: () => {},
        };
      }
      let finish: (exit: Exit) => void = () => {};
      const ended = new Promise<Exit>((resolve) => {
        finish = resolve;
      });
      const run: FakeRun = {
        request,
        killed: false,
        end: (code) => finish({ code, signal: null }),
        program: {
          stdin: new WritableStream(),
          stdout: stream(""),
          stderr: stream(""),
          ended,
          killTree: () => {
            run.killed = true;
            finish({ code: null, signal: "SIGKILL" });
          },
        },
      };
      runs.push(run);
      return run.program;
    },
  };
  return { runner, runs, probes };
}

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "srt-session-test-"));
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(base, { recursive: true, force: true });
});

function profile(overrides: Partial<SandboxProfile> = {}): SandboxProfile {
  return {
    workingFolder: join(base, "work"),
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: { HOME: "/nowhere" },
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 60_000,
    ...overrides,
  };
}

const command = { program: "echo", args: ["hi"] };

verifies("sandbox-srt.session", () => {
  describe("SrtSandbox.open", () => {
    it("reports the fence as proven when the probe is refused both ways", async () => {
      const { runner, probes } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      expect(session.fence).toEqual({ state: "fenced" });
      expect(probes).toHaveLength(1);
      await session.close();
    });

    it.each([
      [
        "the canary file is readable",
        { ...fenced, canary: "readable" },
        /read a file the fence should hide/,
      ],
      ["the canary port connects", { ...fenced, port: "connected" }, /connect to a loopback port/],
      ["the canary port is reached", { ...fenced, leak: true }, /reached a loopback port/],
      ["the probe can't see the temp folder", { ...fenced, control: "hidden" }, /temp folder/],
      ["the probe says nothing", { ...fenced, garbage: "" }, /did not report/],
      [
        "the probe can't be launched",
        { ...fenced, launchFails: true },
        /could not run: spawn bwrap/,
      ],
    ])("is not fenced when %s, and start throws", async (_name, probe, reason) => {
      const { runner, runs } = fakeRunner(probe);
      const session = await new SrtSandbox(linux, runner).open(profile());
      expect(session.fence.state).toBe("not-fenced");
      expect(session.fence.state === "not-fenced" && session.fence.reason).toMatch(reason);
      await expect(session.start(command)).rejects.toThrow(/fence is not proven/);
      expect(runs).toEqual([]);
      await session.close();
    });

    it("rejects a bridge that is not a loopback address", async () => {
      const { runner, probes } = fakeRunner();
      const open = new SrtSandbox(linux, runner).open(
        profile({ network: { bridge: { host: "10.0.0.5", port: 4100 }, allowedSites: [] } }),
      );
      await expect(open).rejects.toThrow(/loopback/);
      expect(probes).toEqual([]);
    });

    it.each(["127.0.0.1", "127.1.2.3", "::1", "[::1]", "localhost"])(
      "accepts the bridge %s",
      async (host) => {
        const { runner } = fakeRunner();
        const session = await new SrtSandbox(linux, runner).open(
          profile({ network: { bridge: { host, port: 4100 }, allowedSites: [] } }),
        );
        expect(session.fence).toEqual({ state: "fenced" });
        await session.close();
      },
    );

    it("gives each session its own private settings folder, hidden from the program", async () => {
      const { runner, probes } = fakeRunner();
      const sandbox = new SrtSandbox(linux, runner);
      const first = await sandbox.open(profile());
      const second = await sandbox.open(profile());
      const a = probes[0]?.settingsPath ?? "";
      const b = probes[1]?.settingsPath ?? "";
      expect(a).not.toBe(b);
      const config = JSON.parse(readFileSync(a, "utf8"));
      expect(config.filesystem.denyRead).toContainEqual({ path: dirname(a), literal: true });
      await first.close();
      expect(existsSync(a)).toBe(false);
      expect(existsSync(b)).toBe(true);
      await second.close();
      expect(existsSync(b)).toBe(false);
    });

    it("creates the temp folder and leaves nothing of the proof in it", async () => {
      const { runner } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      expect(readdirSync(join(base, "temp"))).toEqual([]);
      await session.close();
    });
  });

  describe("the launcher environment", () => {
    it("is the host's absolute PATH and the temp folder, and nothing from the profile or the host", () => {
      const env = launcherEnv(
        profile({ env: { HOME: "/h", PATH: "/evil", NODE_OPTIONS: "-r x" } }),
        {
          PATH: "/usr/bin:/bin",
          SECRET: "x",
        },
      );
      expect(env).toEqual({ PATH: "/usr/bin:/bin", TMPDIR: join(base, "temp") });
    });

    it("drops relative PATH entries and entries the program can write", () => {
      const env = launcherEnv(profile(), {
        PATH: [
          "/usr/bin",
          "",
          ".",
          "node_modules/.bin",
          join(base, "work", "node_modules", ".bin"),
          join(base, "temp"),
          "/bin",
        ].join(delimiter),
      });
      expect(env["PATH"]).toBe(["/usr/bin", "/bin"].join(delimiter));
    });

    it("has no PATH when the host has none", () => {
      expect(launcherEnv(profile(), {})).toEqual({ TMPDIR: join(base, "temp") });
    });
  });

  describe("the program environment", () => {
    it("is the profile's variables and the temp folder, and nothing of the host", () => {
      const env = programEnv(profile({ env: { HOME: "/h", FOO: "1" } }), { SECRET: "x" });
      expect(env).toEqual({ TMPDIR: join(base, "temp"), HOME: "/h", FOO: "1" });
    });

    it("gets the host's safe PATH unless the profile sets one", () => {
      const host = { PATH: ["/usr/bin", "bin"].join(delimiter) };
      expect(programEnv(profile(), host)["PATH"]).toBe("/usr/bin");
      expect(programEnv(profile({ env: { PATH: "/opt/bin" } }), host)["PATH"]).toBe("/opt/bin");
    });

    it("never carries a proxy variable, so srt finds no parent proxy to trust", () => {
      const proxies = Object.fromEntries(
        ["HTTP_PROXY", "https_proxy", "ALL_PROXY", "NO_PROXY", "no_proxy"].map((name) => [
          name,
          "http://10.0.0.9:3128",
        ]),
      );
      const env = programEnv(profile({ env: { HOME: "/h", ...proxies } }), proxies);
      expect(Object.keys(env).sort()).toEqual(["HOME", "TMPDIR"]);
    });
  });

  describe("what the probe and every program get", () => {
    it("keeps the profile's variables out of the launcher and the host's proxy out of both", async () => {
      vi.stubEnv("HTTPS_PROXY", "http://10.0.0.9:3128");
      vi.stubEnv("PATH", ["/usr/bin", "node_modules/.bin"].join(delimiter));
      const { runner, runs, probes } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(
        profile({ env: { HOME: "/h", PATH: "node_modules/.bin", LD_PRELOAD: "/x.so" } }),
      );
      await session.start(command);
      const requests = [...probes, ...runs.map((run) => run.request)];
      expect(requests).toHaveLength(2);
      for (const request of requests) {
        expect(request.launcherEnv).toEqual({ PATH: "/usr/bin", TMPDIR: join(base, "temp") });
        expect(request.programEnv).toEqual({
          TMPDIR: join(base, "temp"),
          HOME: "/h",
          PATH: "node_modules/.bin",
          LD_PRELOAD: "/x.so",
        });
      }
      await session.close();
    });
  });

  describe("SrtSession.start", () => {
    it("starts the program in the working folder with the session's settings", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const started = await session.start({ program: "git", args: ["status", "a b"] });
      expect(runs[0]?.request).toMatchObject({
        program: "git",
        args: ["status", "a b"],
        cwd: join(base, "work"),
      });
      runs[0]?.end(3);
      expect(await started.exited).toEqual({ code: 3, signal: null, reason: "exited" });
      await session.close();
    });

    it("starts in a folder inside the working folder and refuses one outside", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      await session.start({ ...command, cwd: "sub/dir" });
      expect(runs[0]?.request.cwd).toBe(join(base, "work", "sub", "dir"));
      await expect(session.start({ ...command, cwd: "../other" })).rejects.toThrow(
        /working folder/,
      );
      await expect(session.start({ ...command, cwd: "/etc" })).rejects.toThrow(/working folder/);
      await session.close();
    });

    it("refuses a program that is a skill's script, before the fence starts it", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const before = runs.length;
      for (const program of [
        "skills/x/scripts/run.sh",
        "./.claude/skills/x/scripts/run.sh",
        join(base, "work", "skills", "x", "scripts", "nested", "run.py"),
        "../work/skills/x/scripts/run.sh",
      ]) {
        await expect(session.start({ program, args: [] })).rejects.toThrow(
          /doesn't start a skill's scripts/,
        );
      }
      expect(runs).toHaveLength(before);
      await session.close();
    });

    it("refuses a link that leads into a skill's scripts folder", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const scripts = join(base, "work", "skills", "x", "scripts");
      await mkdir(scripts, { recursive: true });
      await writeFile(join(scripts, "run.sh"), "#!/bin/sh\n");
      await symlink(join(scripts, "run.sh"), join(base, "work", "innocent"));
      await expect(session.start({ program: "./innocent", args: [] })).rejects.toThrow(
        /doesn't start a skill's scripts/,
      );
      expect(runs).toHaveLength(0);
      await session.close();
    });

    it("still starts bare names and other programs with a path", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      await session.start({ program: "scripts", args: [] });
      await session.start({ program: "./tools/scripts/run.sh", args: [] });
      await session.start({ program: "skills/x/SKILL.md", args: [] });
      expect(runs).toHaveLength(3);
      await session.close();
    });

    it("throws once the session is closed", async () => {
      const { runner } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      await session.close();
      expect(session.fence).toEqual({ state: "stopped" });
      await expect(session.start(command)).rejects.toThrow(/closed/);
    });
  });

  describe("stopping programs", () => {
    it("kill ends the whole tree, says it was stopped and is safe to call twice", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const started = await session.start(command);
      await started.kill();
      await started.kill();
      expect(runs[0]?.killed).toBe(true);
      expect(await started.exited).toEqual({ code: null, signal: "SIGKILL", reason: "stopped" });
      await session.close();
    });

    it("close stops every program and is safe to call twice", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const one = await session.start(command);
      const two = await session.start(command);
      await Promise.all([session.close(), session.close()]);
      expect(runs.map((run) => run.killed)).toEqual([true, true]);
      expect((await one.exited).reason).toBe("stopped");
      expect((await two.exited).reason).toBe("stopped");
    });

    it("stops a program that was still launching when the session closed", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const starting = session.start(command);
      const closing = session.close();
      const started = await starting;
      await closing;
      expect(runs[0]?.killed).toBe(true);
      expect((await started.exited).reason).toBe("stopped");
    });

    it("stops everything when the time limit runs out, counted from open", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile({ timeLimitMs: 5000 }));
      const started = await session.start(command);
      await vi.advanceTimersByTimeAsync(5000);
      expect(runs[0]?.killed).toBe(true);
      expect(await started.exited).toEqual({ code: null, signal: "SIGKILL", reason: "timeout" });
      expect(session.fence).toEqual({ state: "stopped" });
    });

    it("says timeout for a program still launching when the time limit runs out", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile({ timeLimitMs: 5000 }));
      const starting = session.start(command);
      await vi.advanceTimersByTimeAsync(5000);
      const started = await starting;
      expect(runs[0]?.killed).toBe(true);
      expect((await started.exited).reason).toBe("timeout");
    });

    it("stops everything when the signal aborts, and at once when it is aborted already", async () => {
      const { runner, runs } = fakeRunner();
      const controller = new AbortController();
      const session = await new SrtSandbox(linux, runner).open(profile(), {
        signal: controller.signal,
      });
      const started = await session.start(command);
      controller.abort();
      expect((await started.exited).reason).toBe("stopped");
      expect(runs[0]?.killed).toBe(true);
      await session.close();
      expect(session.fence).toEqual({ state: "stopped" });

      const late = await new SrtSandbox(linux, runner).open(profile(), {
        signal: AbortSignal.abort(),
      });
      await late.close();
      expect(late.fence).toEqual({ state: "stopped" });
    });

    it("lets a listener leave twice without trouble", async () => {
      const { runner } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const leave = session.onBlocked(() => {});
      expect(() => {
        leave();
        leave();
      }).not.toThrow();
      await session.close();
    });
  });
});
