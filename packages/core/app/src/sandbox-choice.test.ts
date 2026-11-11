import type { SandboxCheck, SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it, vi } from "vitest";
import {
  type MxcDefault,
  type MxcState,
  mxcDefault,
  mxcStates,
  type SandboxBackend,
  SandboxChoiceService,
} from "./sandbox-choice.ts";
import type { CanaryFindings } from "./sandbox-trust-check.ts";

const profile: SandboxProfile = {
  workingFolder: "/acme/project",
  tempFolder: "/local-app-data/Halonic/tmp/canary",
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 30_000,
};

const ok: SandboxCheck = { ok: true, reason: null, missing: [] };
const windows: SandboxCheck = { ok: false, reason: "windows", missing: [] };

const clean: CanaryFindings = {
  started: true,
  leaks: [],
  controls: { readOnlyFileRead: true, workFolderScriptLoaded: true },
  nameLookupsLeave: true,
  missing: [],
};

const tooStrict: CanaryFindings = {
  ...clean,
  controls: { readOnlyFileRead: false, workFolderScriptLoaded: true },
  missing: ["the read-only file couldn't be read"],
};

interface Machine {
  platform?: string;
  srt?: SandboxCheck;
  mxcOffered?: boolean;
  /** What each canary run finds, in turn; the last one repeats. */
  canary?: CanaryFindings[];
  default?: MxcDefault;
  /** Each canary probe waits for this before it reports. */
  probeGate?: () => Promise<void>;
}

/** A choice over fake backends, how many trust checks MXC ran, and the most that ran at once. */
function machine(setup: Machine = {}) {
  const findings = setup.canary ?? [clean];
  let checks = 0;
  let running = 0;
  let mostAtOnce = 0;
  const srt: SandboxBackend = {
    id: "srt",
    offered: async () => true,
    sandbox: {
      check: async () => setup.srt ?? windows,
      open: () => Promise.reject(new Error("srt opens no canary")),
    },
  };
  const mxc: SandboxBackend = {
    id: "mxc",
    offered: async () => setup.mxcOffered ?? true,
    sandbox: {
      check: async () => ok,
      open: async (given): Promise<SandboxSession> =>
        new FakeSandboxSession({ profile: given, program: idleProgram }),
    },
    canary: {
      profile: async () => profile,
      probe: async () => {
        checks += 1;
        running += 1;
        mostAtOnce = Math.max(mostAtOnce, running);
        try {
          await setup.probeGate?.();
          return findings[Math.min(checks, findings.length) - 1] ?? clean;
        } finally {
          running -= 1;
        }
      },
    },
  };
  const choice = new SandboxChoiceService({
    platform: setup.platform ?? "win32",
    backends: [srt, mxc],
    ...(setup.default === undefined ? {} : { mxcDefault: setup.default }),
  });
  return { choice, trustChecks: () => checks, mostAtOnce: () => mostAtOnce };
}

verifies("app.sandbox-choice", () => {
  it("leaves MXC out where it isn't offered, and runs srt when its check passes", async () => {
    const linux = machine({ platform: "linux", srt: ok, default: "on" });
    expect(await linux.choice.start({ mxc: "on" })).toEqual({
      active: "srt",
      mxc: { offered: false, setting: "on", effective: "on", state: "not-offered" },
    });
    expect(linux.trustChecks()).toBe(0);

    const windows10 = machine({ mxcOffered: false });
    expect(await windows10.choice.start({ mxc: "on" })).toMatchObject({
      active: null,
      mxc: { state: "not-offered" },
    });
  });

  it("keeps MXC off when it isn't set and the default is opt-in", async () => {
    const { choice, trustChecks } = machine();
    expect(await choice.start({ mxc: null })).toEqual({
      active: null,
      mxc: { offered: true, setting: null, effective: "off", state: "off" },
    });
    expect(trustChecks()).toBe(0);
    expect(await choice.start({ mxc: "off" })).toMatchObject({ mxc: { state: "off" } });
  });

  it("runs srt before a default-on MXC, but an MXC set to on comes first", async () => {
    const byDefault = machine({ srt: ok, default: "on" });
    expect(await byDefault.choice.start({ mxc: null })).toMatchObject({
      active: "srt",
      mxc: { effective: "on", state: "not-used" },
    });
    expect(byDefault.trustChecks()).toBe(0);

    const chosen = machine({ srt: ok });
    expect(await chosen.choice.start({ mxc: "on" })).toEqual({
      active: "mxc",
      mxc: {
        offered: true,
        setting: "on",
        effective: "on",
        state: "in-use",
        nameLookupsLeave: true,
      },
    });
  });

  it("runs a default-on MXC after a trust check when srt doesn't work on Windows", async () => {
    const { choice, trustChecks } = machine({ default: "on" });
    expect(await choice.start({ mxc: null })).toMatchObject({
      active: "mxc",
      mxc: { state: "in-use" },
    });
    expect(trustChecks()).toBe(1);
  });

  it("runs nothing when the check fails, without falling through to srt or changing the setting", async () => {
    const { choice } = machine({ srt: ok, canary: [tooStrict] });
    expect(await choice.start({ mxc: "on" })).toEqual({
      active: null,
      mxc: {
        offered: true,
        setting: "on",
        effective: "on",
        state: "mxc-check-failed",
        reason: "too-strict",
        missing: ["the read-only file couldn't be read"],
      },
    });
    expect(choice.current()?.mxc.setting).toBe("on");
  });

  it("keeps MXC off for the rest of this start once its check failed, and checks again on a new start", async () => {
    const first = machine({ canary: [tooStrict, clean] });
    await first.choice.start({ mxc: "on" });
    expect(await first.choice.settingsChanged({ mxc: "on" })).toMatchObject({
      mxc: { state: "mxc-check-failed", reason: "too-strict" },
    });
    expect(await first.choice.sessionNotFenced()).toMatchObject({ active: null });
    expect(first.trustChecks()).toBe(1);
    expect(await first.choice.settingsChanged({ mxc: "off" })).toMatchObject({
      mxc: { state: "off" },
    });

    const nextStart = machine({ canary: [clean] });
    expect(await nextStart.choice.start({ mxc: "on" })).toMatchObject({ active: "mxc" });
  });

  it("checks again after a settings change and when a session isn't fenced", async () => {
    const leak: CanaryFindings = { ...clean, leaks: ["port-reachable"] };
    const { choice, trustChecks } = machine({ canary: [clean, clean, leak] });
    expect(choice.current()).toBeNull();
    await choice.start({ mxc: "on" });
    await choice.settingsChanged({ mxc: "on" });
    expect(await choice.sessionNotFenced()).toMatchObject({
      active: null,
      mxc: { state: "mxc-check-failed", reason: "port-reachable" },
    });
    expect(trustChecks()).toBe(3);
  });

  it("runs one trust check at a time", async () => {
    let release = () => {};
    const firstProbe = new Promise<void>((resolve) => {
      release = resolve;
    });
    let probes = 0;
    const { choice, trustChecks, mostAtOnce } = machine({
      probeGate: () => (++probes === 1 ? firstProbe : Promise.resolve()),
    });

    const started = choice.start({ mxc: "on" });
    const changed = choice.settingsChanged({ mxc: "on" });
    await vi.waitFor(() => expect(trustChecks()).toBe(1));
    // The first probe is still pending, so the second check waits its turn.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(trustChecks()).toBe(1);

    release();
    await Promise.all([started, changed]);
    expect(trustChecks()).toBe(2);
    expect(mostAtOnce()).toBe(1);
  });

  it("keeps a failed check for this start when two triggers arrive together", async () => {
    const { choice, trustChecks } = machine({ canary: [tooStrict] });
    await Promise.all([choice.start({ mxc: "on" }), choice.settingsChanged({ mxc: "on" })]);
    expect(trustChecks()).toBe(1);
  });

  it("needs every backend, and MXC with a canary", () => {
    const srt: SandboxBackend = {
      id: "srt",
      offered: async () => true,
      sandbox: {
        check: async () => ok,
        open: async () => {
          throw new Error("unused");
        },
      },
    };
    expect(() => new SandboxChoiceService({ platform: "win32", backends: [srt] })).toThrow(/mxc/);
    const mxc: SandboxBackend = { ...srt, id: "mxc" };
    expect(() => new SandboxChoiceService({ platform: "win32", backends: [srt, mxc] })).toThrow(
      /canary/,
    );
  });

  it("keeps MXC opt-in by default, and its states to the closed list", () => {
    expect(mxcDefault).toBe("opt-in");
    expect(mxcStates).toEqual(["not-offered", "off", "in-use", "not-used", "mxc-check-failed"]);
    expectTypeOf<"on-by-default">().not.toMatchTypeOf<MxcState>();
  });
});
