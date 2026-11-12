import { win32 } from "node:path";
import type { SandboxBlock, SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { readText, sandboxFenceContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import {
  type Behavior,
  dataFolder,
  FakeMxc,
  healthyBox,
  isProbe,
  type Leaks,
  nodeFolder,
  nodeProgram,
  type ProbeSettings,
  testBoxes,
} from "./fake-mxc.test-helper.ts";
import { fenceFiles } from "./fence-files.ts";
import { grantPath } from "./grant-path.ts";
import { MemoryDisk } from "./memory-disk.test-helper.ts";
import { MxcSandbox } from "./mxc-sandbox.ts";
import type { MxcSession } from "./mxc-session.ts";

// Made-up Windows paths, each marked for the leak guard on its own line.
const work = "C:\\acme\\work"; // leak-guard: allow absolute-path made-up Windows path for a test
const temp = "C:\\acme\\temp"; // leak-guard: allow absolute-path made-up Windows path for a test
const tools = "C:\\acme\\tools"; // leak-guard: allow absolute-path made-up Windows path for a test
const keys = "C:\\acme\\keys\\id.txt"; // leak-guard: allow absolute-path made-up Windows path for a test

const profile: SandboxProfile = {
  workingFolder: work,
  tempFolder: temp,
  settingsFolder: null,
  readOnlyPaths: [tools],
  deniedPaths: [keys],
  env: { CLAUDE_CONFIG_DIR: "settings" },
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 10_000,
};

/** The adapter on a fake SDK and a memory disk. `behavior` says what programs do; a healthy box by default. */
function setup(leaksOrBehavior: Leaks | ((disk: MemoryDisk) => Behavior) = {}) {
  const disk = new MemoryDisk().folder(work).folder(tools).folder(nodeFolder);
  const behavior =
    typeof leaksOrBehavior === "function"
      ? leaksOrBehavior(disk)
      : healthyBox(disk, leaksOrBehavior);
  const fake = new FakeMxc(disk, behavior);
  const { boxes, made } = testBoxes(disk);
  const sandbox = new MxcSandbox(fake.machine(), boxes, { disk, nodeProgram });
  return { disk, fake, sandbox, made };
}

async function open(
  sandbox: MxcSandbox,
  change: Partial<SandboxProfile> = {},
  signal?: AbortSignal,
): Promise<SandboxSession> {
  return sandbox.open({ ...profile, ...change }, signal === undefined ? {} : { signal });
}

const program = { program: "C:\\acme\\tools\\agent.exe", args: ["--go"] }; // leak-guard: allow absolute-path made-up Windows path for a test

const notFenced = setup({ hidden: true });
sandboxFenceContract("mxc", {
  openNotFenced: () => open(notFenced.sandbox),
  startedPrograms: () => notFenced.fake.programs().length,
});

verifies("sandbox-mxc.session", () => {
  describe("the fence proof at open", () => {
    it("is fenced when the probe is refused the hidden file, the denied file and the loopback port, and reads the allowed folder", async () => {
      const { sandbox } = setup();
      const session = await open(sandbox);
      expect(session.fence).toEqual({ state: "fenced" });
      await session.close();
    });

    it("runs the probe under the session's real policy, with the symlink flags", async () => {
      const { sandbox, fake } = setup();
      await (await open(sandbox)).close();
      const [probe] = fake.probes();
      expect(probe?.command).toContain("--preserve-symlinks --preserve-symlinks-main");
      expect(probe?.network.runtimeConfig).toEqual({ networkProxy: "http://127.0.0.1:4100" });
      expect(probe?.filesystem.readwritePaths).toEqual([work, temp]);
      expect(probe?.environment).toMatchObject({ CLAUDE_CONFIG_DIR: "settings", TEMP: temp });
    });

    it("keeps the Node folder and the proof's own folder readable for the probe only", async () => {
      const { sandbox, fake, made } = setup();
      const session = await open(sandbox);
      await session.start(program);
      const [probe] = fake.probes();
      const [real] = fake.programs();
      const [box] = made();
      const readable = grantPath(fenceFiles(box ?? "").readable);
      expect(probe?.filesystem.readonlyPaths).toEqual([tools, readable, nodeFolder]);
      expect(real?.filesystem.readonlyPaths).toEqual([tools]);
      expect(JSON.stringify(real)).not.toContain("readable");
      await session.close();
    });

    it("denies the denied canary inside the readable folder, next to the profile's own denied paths", async () => {
      const { sandbox, fake } = setup();
      await (await open(sandbox)).close();
      const [probe] = fake.probes();
      expect(probe?.filesystem.deniedPaths).toEqual([keys, expect.stringMatching(/denied\.txt$/)]);
    });

    it("probes the loopback ports of 127.0.0.1, and of ::1 where this computer has it", async () => {
      const seen: string[][] = [];
      const { sandbox } = setup((disk) => {
        const healthy = healthyBox(disk);
        return async (call) => {
          if (call.settings?.ports !== undefined) {
            seen.push(call.settings.ports.map(({ host }) => host));
          }
          return healthy(call);
        };
      });
      const session = await open(sandbox);
      expect(session.fence).toEqual({ state: "fenced" });
      expect(seen).toHaveLength(1);
      expect(seen[0]?.[0]).toBe("127.0.0.1");
      expect(seen[0]?.length === 1 || seen[0]?.[1] === "::1").toBe(true);
      await session.close();
    });

    it("probes the internet and DNS, with the bridge as the network control, and counts a timeout as blocked once the control connected", async () => {
      const seen: ProbeSettings[] = [];
      const { sandbox } = setup((disk) => {
        const healthy = healthyBox(disk, { blockedAttemptsTimeOut: true });
        return async (call) => {
          if (call.settings?.internet !== undefined) seen.push(call.settings);
          return healthy(call);
        };
      });
      const session = await open(sandbox);
      expect(session.fence).toEqual({ state: "fenced" });
      expect(seen[0]).toMatchObject({ bridge: { host: "127.0.0.1", port: 4100 } });
      expect(seen[0]?.internet?.length).toBeGreaterThan(0);
      expect(seen[0]?.dns?.length).toBeGreaterThan(0);
      await session.close();
    });

    it.each<[string, Leaks, RegExp]>([
      ["the hidden file is readable", { hidden: true }, /could read a file the fence should hide/],
      ["the denied file is readable", { denied: true }, /denied file inside a folder it may read/],
      [
        "a port of this computer is reached",
        { reachPort: true },
        /port of this computer it should not reach/,
      ],
      ["an address on the internet is reached", { reachInternet: true }, /address on the internet/],
      ["a public DNS server answers", { reachDns: true }, /public DNS server/],
      [
        "the network probes fail with an error that is no refusal (Winsock without SystemRoot)",
        { networkFailsWith: "UNKNOWN" },
        /did not prove the block.*not a refusal/,
      ],
      [
        "blocked probes time out and the bridge can't be reached",
        { blockedAttemptsTimeOut: true, bridgeUnreachable: true },
        /did not prove the block.*could not reach its bridge/,
      ],
      ["the allowed folder can't be read", { controlUnreadable: true }, /proves nothing/],
    ])(
      "is not-fenced when %s, and start throws and starts nothing",
      async (_what, leaks, reason) => {
        const { sandbox, fake } = setup(leaks);
        const session = await open(sandbox);
        expect(session.fence).toMatchObject({
          state: "not-fenced",
          reason: expect.stringMatching(reason),
        });
        await expect(session.start(program)).rejects.toThrow("fence is not proven");
        expect(fake.programs()).toEqual([]);
        await session.close();
      },
    );

    it.each<[string, Behavior, RegExp]>([
      [
        "the probe prints nothing",
        () => ({ exitCode: 1, stderr: "Error: no such module\n" }),
        /did not report \(exit 1\): Error: no such module/,
      ],
      ["the probe prints other text", () => ({ stdout: "hello\n" }), /did not report/],
      [
        "MXC can't start the probe",
        () => {
          throw new Error("the container can't start");
        },
        /could not run: the container can't start/,
      ],
    ])("is not-fenced when %s", async (_what, behavior, reason) => {
      const { sandbox } = setup(() => behavior);
      const session = await open(sandbox);
      expect(session.fence).toMatchObject({
        state: "not-fenced",
        reason: expect.stringMatching(reason),
      });
      await session.close();
    });

    it("is not-fenced when the box folder lies inside a denied path, so the control can't be read", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox, { deniedPaths: [dataFolder] });
      expect(session.fence).toMatchObject({
        state: "not-fenced",
        reason: expect.stringContaining("inside a denied path"),
      });
      expect(fake.requests).toEqual([]);
      await session.close();
    });
  });

  describe("read-only files", () => {
    const file = `${tools}\\config.json`;

    it("copies a read-only file into the box folder and grants only the folder of copies", async () => {
      const { sandbox, fake, disk } = setup();
      disk.file(file, "settings");
      const session = (await open(sandbox, { readOnlyPaths: [file] })) as MxcSession;
      const [copy] = session.readOnlyCopies;
      expect(copy?.original).toBe(file);
      expect(copy?.copy).toContain("box-4242-1");
      expect(await disk.readText(copy?.copy ?? "")).toBe("settings");
      const granted = fake.requests.flatMap((request) => request.filesystem.readonlyPaths ?? []);
      expect(granted).toContain(grantPath(`${win32.dirname(win32.dirname(copy?.copy ?? ""))}`));
      expect(granted).not.toContain(tools);
      expect(granted).not.toContain(file);
      await session.close();
      expect(disk.fileNames().filter((name) => name.includes("mxc-boxes"))).toEqual([]);
    });

    it("starts the program on the copy, not the original", async () => {
      const { sandbox, fake, disk } = setup();
      disk.file(file, "settings");
      const session = (await open(sandbox, { readOnlyPaths: [file] })) as MxcSession;
      const [copy] = session.readOnlyCopies;
      await session.start({ program: "node", args: [`--allow-fs-read=${file}`, file, "--go"] });
      const [real] = fake.programs();
      expect(real?.command).toContain(`--allow-fs-read=${copy?.copy}`);
      expect(real?.command).not.toContain(file);
      await session.close();
    });

    it("refuses a file inside a denied path and removes the box folder", async () => {
      const { sandbox, disk, fake } = setup();
      disk.file(file);
      await expect(open(sandbox, { readOnlyPaths: [file], deniedPaths: [tools] })).rejects.toThrow(
        "inside a denied path",
      );
      expect(fake.requests).toEqual([]);
      expect(disk.fileNames().filter((name) => name.includes("mxc-boxes"))).toEqual([]);
    });
  });

  describe("the box folder", () => {
    it("is a new folder for every session, and is removed when the session closes", async () => {
      const { sandbox, made, disk } = setup();
      const first = await open(sandbox);
      const second = await open(sandbox);
      const [one, two] = made();
      expect(one).not.toBe(two);
      expect(disk.fileNames().some((name) => name.includes("box-4242-1"))).toBe(true);
      await first.close();
      expect(disk.fileNames().some((name) => name.includes("box-4242-1"))).toBe(false);
      expect(disk.fileNames().some((name) => name.includes("box-4242-2"))).toBe(true);
      await second.close();
      expect(disk.fileNames().filter((name) => name.includes("mxc-boxes"))).toEqual([]);
    });

    it("is removed too when the session opened not-fenced", async () => {
      const { sandbox, disk } = setup({ hidden: true });
      await (await open(sandbox)).close();
      expect(disk.fileNames().filter((name) => name.includes("mxc-boxes"))).toEqual([]);
    });

    it("is never made for a profile that is refused", async () => {
      const { sandbox, made, fake } = setup();
      await expect(
        open(sandbox, { network: { ...profile.network, allowedSites: ["registry.npmjs.org"] } }),
      ).rejects.toThrow("allowedSites");
      expect(made()).toEqual([]);
      expect(fake.requests).toEqual([]);
    });
  });

  describe("what MXC is asked", () => {
    it("passes telemetry off on every call, never denial capture, and no egress rule", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox);
      await session.start(program);
      await session.close();
      expect(fake.requests.length).toBeGreaterThan(1);
      expect(fake.options).toEqual(fake.requests.map(() => ({ telemetry: { enabled: false } })));
      for (const request of fake.requests) {
        expect(JSON.stringify(request)).not.toContain("captureDenials");
        expect(request.network.egress).toEqual({ default: "deny" });
        expect(request.ui).toEqual({
          disable: false,
          clipboard: "none",
          allowInputInjection: false,
        });
      }
    });

    it("starts the caller's program under the profile's grants and only its environment", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox);
      await session.start({ ...program, cwd: "src" });
      const [real] = fake.programs();
      expect(real).toMatchObject({
        command: "C:\\acme\\tools\\agent.exe --go", // leak-guard: allow absolute-path made-up Windows path for a test
        workingDirectory: `${work}\\src`,
        filesystem: { readonlyPaths: [tools], readwritePaths: [work, temp], deniedPaths: [keys] },
        inheritDefaultEnvironment: false,
      });
      expect(real?.environment).toEqual({
        CLAUDE_CONFIG_DIR: "settings",
        TEMP: temp,
        TMP: temp,
        NODE_OPTIONS: "--preserve-symlinks --preserve-symlinks-main",
      });
      await session.close();
    });

    it("refuses to start in a folder outside the working folder", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox);
      await expect(session.start({ ...program, cwd: ".." })).rejects.toThrow(
        "inside the working folder",
      );
      expect(fake.programs()).toEqual([]);
      await session.close();
    });
  });

  describe("programs", () => {
    it("streams the program's output and reports how it ended", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox);
      fake.behave(() => ({ stdout: "hello\n", exitCode: 3 }));
      const started = await session.start(program);
      expect(await readText(started.stdout)).toBe("hello\n");
      expect(await started.exited).toEqual({ code: 3, signal: null, reason: "exited" });
      await session.close();
      expect(fake.disposed).toBeGreaterThan(0);
    });

    it("stops a program with kill, and reports it as stopped", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox);
      fake.behave(() => ({ hang: true }));
      const started = await session.start(program);
      await started.kill();
      await started.kill();
      expect(await started.exited).toMatchObject({ reason: "stopped" });
      await session.close();
    });

    it("stops every program on close, and the fence reads stopped", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox);
      fake.behave(() => ({ hang: true }));
      const started = await session.start(program);
      await session.close();
      await session.close();
      expect(await started.exited).toMatchObject({ reason: "stopped" });
      expect(session.fence).toEqual({ state: "stopped" });
      await expect(session.start(program)).rejects.toThrow("closed");
    });

    it("stops the program when the time limit runs out, with the reason timeout", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox, { timeLimitMs: 400 });
      fake.behave(() => ({ hang: true }));
      const started = await session.start(program);
      expect(await started.exited).toMatchObject({ reason: "timeout" });
      await vi.waitFor(() => expect(session.fence).toEqual({ state: "stopped" }));
    });

    it("hands every program the time that is left, not the whole limit", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox, { timeLimitMs: 5000 });
      await session.start(program);
      for (const request of fake.requests) expect(request.timeoutMs).toBeLessThanOrEqual(5000);
      await session.close();
    });

    it("closes when the signal aborts", async () => {
      const { sandbox, fake } = setup();
      const abort = new AbortController();
      const session = await open(sandbox, {}, abort.signal);
      fake.behave(() => ({ hang: true }));
      const started = await session.start(program);
      abort.abort();
      expect(await started.exited).toMatchObject({ reason: "stopped" });
      await vi.waitFor(() => expect(session.fence).toEqual({ state: "stopped" }));
    });

    it("closes at once when the signal was already aborted", async () => {
      const { sandbox } = setup();
      const session = await open(sandbox, {}, AbortSignal.abort());
      await vi.waitFor(() => expect(session.fence).toEqual({ state: "stopped" }));
    });
  });

  describe("onBlocked", () => {
    it("reports what the program's own errors show it was refused, and nothing else", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox);
      const blocks: SandboxBlock[] = [];
      session.onBlocked((block) => blocks.push(block));
      fake.behave(() => ({
        stderr: [
          "Error: EACCES: permission denied, open 'C:\\acme\\keys\\id.txt'", // leak-guard: allow absolute-path made-up Windows path for a test
          "plain text that says nothing",
          "Error: connect ECONNREFUSED 127.0.0.1:5000",
        ].join("\r\n"),
      }));
      const started = await session.start(program);
      const errors = await readText(started.stderr);
      expect(errors).toContain("plain text");
      await vi.waitFor(() => expect(blocks).toHaveLength(2));
      expect(blocks).toEqual([
        { kind: "file", path: "C:\\acme\\keys\\id.txt", access: "read" }, // leak-guard: allow absolute-path made-up Windows path for a test
        { kind: "network", host: "127.0.0.1", port: 5000 },
      ]);
      await session.close();
    });

    it("stops reporting to a listener that unsubscribed", async () => {
      const { sandbox, fake } = setup();
      const session = await open(sandbox);
      const heard = vi.fn();
      session.onBlocked(heard)();
      fake.behave(() => ({ stderr: "connect ECONNREFUSED 127.0.0.1:5000\n" }));
      const started = await session.start(program);
      await readText(started.stderr);
      await started.exited;
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(heard).not.toHaveBeenCalled();
      await session.close();
    });
  });

  it("asks MXC for nothing when it can't start here", async () => {
    const disk = new MemoryDisk();
    const fake = new FakeMxc(disk, healthyBox(disk));
    const sandbox = new MxcSandbox(
      { ...fake.machine(), platform: "linux" },
      testBoxes(disk).boxes,
      { disk, nodeProgram },
    );
    await expect(sandbox.open(profile)).rejects.toThrow("MXC can't start here");
    expect(fake.requests).toEqual([]);
    expect(fake.requests.filter(isProbe)).toEqual([]);
  });
});
