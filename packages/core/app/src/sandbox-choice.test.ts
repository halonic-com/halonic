import type {
  SandboxBackendId,
  SandboxCheck,
  SandboxProfile,
  SandboxSession,
  SandboxSetting,
} from "@halonicjs/ports";
import { FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it, vi } from "vitest";
import {
  defaultBackendOrder,
  type LimitCode,
  type SandboxBackend,
  type SandboxBackendState,
  SandboxChoiceService,
  sandboxBackendStates,
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
const needsSetup: SandboxCheck = { ok: false, reason: "setup-needed", missing: ["not set up"] };
const inContainer: SandboxCheck = { ok: false, reason: "container", missing: ["in a container"] };

const clean: CanaryFindings = {
  started: true,
  leaks: [],
  controls: { readOnlyFileRead: true, workFolderScriptLoaded: true, networkBlockProven: true },
  nameLookupsLeave: true,
  missing: [],
};

const tooStrict: CanaryFindings = {
  ...clean,
  controls: { readOnlyFileRead: false, workFolderScriptLoaded: true, networkBlockProven: true },
  missing: ["the read-only file couldn't be read"],
};

const chosenAt = "2026-11-14T09:00:00.000Z";
const choose = (backend: SandboxBackendId): SandboxSetting => ({ backend, chosenAt });

interface FakeBackend {
  check?: SandboxCheck;
  offered?: boolean;
  limits?: LimitCode[];
  /** What each canary run finds, in turn; the last one repeats. Without it the backend has no canary. */
  canary?: CanaryFindings[];
  /** Each canary probe waits for this before it reports. */
  probeGate?: () => Promise<void>;
}

interface Machine {
  platform?: string;
  setting?: SandboxSetting | null;
  backends?: Partial<Record<SandboxBackendId, FakeBackend>>;
}

/** A choice over fake backends, how many trust checks each ran, and the most that ran at once. */
function machine(setup: Machine = {}) {
  let setting = setup.setting ?? null;
  const checks: Partial<Record<SandboxBackendId, number>> = {};
  let running = 0;
  let mostAtOnce = 0;
  const given = setup.backends ?? { srt: { check: ok }, mxc: { check: ok, canary: [clean] } };
  const backends = (Object.keys(given) as SandboxBackendId[]).map((id): SandboxBackend => {
    const fake = given[id] ?? {};
    const findings = fake.canary ?? [clean];
    return {
      id,
      offered: async () => fake.offered ?? true,
      limits: fake.limits ?? [],
      sandbox: {
        check: async () => fake.check ?? ok,
        open: async (opened): Promise<SandboxSession> =>
          new FakeSandboxSession({ profile: opened, program: idleProgram }),
      },
      ...(fake.canary === undefined
        ? {}
        : {
            canary: {
              profile: async () => profile,
              probe: async () => {
                checks[id] = (checks[id] ?? 0) + 1;
                running += 1;
                mostAtOnce = Math.max(mostAtOnce, running);
                try {
                  await fake.probeGate?.();
                  return findings[Math.min(checks[id] ?? 1, findings.length) - 1] ?? clean;
                } finally {
                  running -= 1;
                }
              },
            },
          }),
    };
  });
  const choice = new SandboxChoiceService({
    platform: setup.platform ?? "linux",
    backends,
    settings: { get: async () => setting },
  });
  return {
    choice,
    trustChecks: (id: SandboxBackendId) => checks[id] ?? 0,
    mostAtOnce: () => mostAtOnce,
    saves: (next: SandboxSetting | null) => {
      setting = next;
    },
  };
}

const statusOf = (choice: { backends: { id: SandboxBackendId }[] } | null, id: SandboxBackendId) =>
  choice?.backends.find((backend) => backend.id === id);

verifies("app.sandbox-choice", () => {
  it("runs the first default backend of the platform when nothing is chosen", async () => {
    expect(defaultBackendOrder("linux")).toEqual(["srt"]);
    expect(defaultBackendOrder("darwin")).toEqual(["srt"]);
    expect(defaultBackendOrder("win32")).toEqual(["srt-wsl"]);

    const linux = machine({ backends: { srt: { check: ok }, "srt-wsl": { check: ok } } });
    const choice = await linux.choice.start();
    expect(choice).toMatchObject({ active: "srt", setting: null });
    expect(choice.backends.map(({ id, state }) => [id, state])).toEqual([
      ["srt", "in-use"],
      ["srt-wsl", "available"],
    ]);
  });

  it("uses only srt-wsl on Windows by default, never native srt or MXC", async () => {
    const backends: Machine["backends"] = {
      srt: { check: ok },
      mxc: { check: ok, canary: [clean] },
    };
    const withoutWsl = machine({ platform: "win32", backends });
    expect(await withoutWsl.choice.start()).toMatchObject({ active: null });
    expect(withoutWsl.trustChecks("mxc")).toBe(0);

    const withWsl = machine({
      platform: "win32",
      backends: { ...backends, "srt-wsl": { check: ok } },
    });
    expect(await withWsl.choice.start()).toMatchObject({ active: "srt-wsl" });
  });

  it("runs the backend the person chose, and only that one", async () => {
    const { choice } = machine({
      platform: "win32",
      setting: choose("srt"),
      backends: { srt: { check: ok }, "srt-wsl": { check: ok } },
    });
    expect(await choice.start()).toMatchObject({
      active: "srt",
      setting: choose("srt"),
      backends: [{ state: "in-use" }, { state: "available" }],
    });
  });

  it("runs no sandbox when the person chose none, and checks no backend", async () => {
    const none: SandboxSetting = { backend: "none", chosenAt, appVersion: "0.1.0" };
    const { choice, trustChecks } = machine({ setting: none });
    expect(await choice.start()).toMatchObject({ active: "none", setting: none });
    expect(trustChecks("mxc")).toBe(0);
  });

  it("reports why a backend can't run: setup to do, or not available", async () => {
    const { choice } = machine({
      setting: choose("srt"),
      backends: { srt: { check: needsSetup }, mxc: { check: inContainer, canary: [clean] } },
    });
    const result = await choice.start();
    expect(result.active).toBeNull();
    expect(result.backends).toMatchObject([
      { id: "srt", state: "setup-needed", reason: "setup-needed", missing: ["not set up"] },
      { id: "mxc", state: "not-available", reason: "container", missing: ["in a container"] },
    ]);
  });

  it("shows a backend this computer doesn't offer as not offered, with no check", async () => {
    const { choice, trustChecks } = machine({
      setting: choose("mxc"),
      backends: { srt: { check: ok }, mxc: { offered: false, canary: [clean] } },
    });
    const result = await choice.start();
    expect(result.active).toBeNull();
    expect(statusOf(result, "mxc")).toMatchObject({ offered: false, state: "not-available" });
    expect(trustChecks("mxc")).toBe(0);
  });

  it("runs nothing when the setting names a backend the host didn't hand over", async () => {
    const { choice } = machine({ setting: choose("docker-sbx") });
    expect(await choice.start()).toMatchObject({ active: null, setting: choose("docker-sbx") });
  });

  it("gives every backend its limits, and the residuals its trust check saw while it is in use", async () => {
    const { choice } = machine({
      setting: choose("mxc"),
      backends: {
        srt: { check: ok, limits: ["project-folder-writable"] },
        mxc: {
          check: ok,
          canary: [clean],
          limits: ["name-lookups-leave", "project-folder-writable"],
        },
      },
    });
    const result = await choice.start();
    expect(statusOf(result, "srt")).toMatchObject({
      limits: ["project-folder-writable"],
      residuals: [],
    });
    expect(statusOf(result, "mxc")).toMatchObject({
      state: "in-use",
      limits: ["name-lookups-leave", "project-folder-writable"],
      residuals: ["name-lookups-leave"],
    });
  });

  it("runs nothing when the check fails, without falling through or changing the setting", async () => {
    const { choice } = machine({
      setting: choose("mxc"),
      backends: { srt: { check: ok }, mxc: { check: ok, canary: [tooStrict] } },
    });
    const result = await choice.start();
    expect(result.active).toBeNull();
    expect(result.setting).toEqual(choose("mxc"));
    expect(statusOf(result, "mxc")).toMatchObject({
      state: "check-failed",
      reason: "too-strict",
      missing: ["the read-only file couldn't be read"],
      residuals: [],
    });
    expect(statusOf(result, "srt")).toMatchObject({ state: "available" });
  });

  it("keeps a failed backend off for the rest of this start, and checks again on a new start", async () => {
    const backends = { mxc: { check: ok, canary: [tooStrict, clean] } };
    const first = machine({ setting: choose("mxc"), backends });
    await first.choice.start();
    expect(await first.choice.settingsChanged()).toMatchObject({ active: null });
    expect(await first.choice.sessionNotFenced()).toMatchObject({ active: null });
    expect(first.trustChecks("mxc")).toBe(1);

    first.saves(null);
    expect(await first.choice.settingsChanged()).toMatchObject({ active: null });

    const nextStart = machine({
      setting: choose("mxc"),
      backends: { mxc: { check: ok, canary: [clean] } },
    });
    expect(await nextStart.choice.start()).toMatchObject({ active: "mxc" });
  });

  it("follows the saved setting after every change, and checks again when a session isn't fenced", async () => {
    const leak: CanaryFindings = { ...clean, leaks: ["port-reachable"] };
    const { choice, trustChecks, saves } = machine({
      setting: choose("mxc"),
      backends: { srt: { check: ok }, mxc: { check: ok, canary: [clean, clean, leak] } },
    });
    expect(choice.current()).toBeNull();
    await choice.start();
    saves(choose("srt"));
    expect(await choice.settingsChanged()).toMatchObject({ active: "srt" });
    saves(choose("mxc"));
    expect(await choice.settingsChanged()).toMatchObject({ active: "mxc" });
    expect(await choice.sessionNotFenced()).toMatchObject({
      active: null,
      backends: [{ id: "srt" }, { state: "check-failed", reason: "port-reachable" }],
    });
    expect(trustChecks("mxc")).toBe(3);
  });

  it("runs one trust check at a time", async () => {
    let release = () => {};
    const firstProbe = new Promise<void>((resolve) => {
      release = resolve;
    });
    let probes = 0;
    const { choice, trustChecks, mostAtOnce } = machine({
      setting: choose("mxc"),
      backends: {
        mxc: {
          check: ok,
          canary: [clean],
          probeGate: () => (++probes === 1 ? firstProbe : Promise.resolve()),
        },
      },
    });

    const started = choice.start();
    const changed = choice.settingsChanged();
    await vi.waitFor(() => expect(trustChecks("mxc")).toBe(1));
    // The first probe is still pending, so the second check waits its turn.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(trustChecks("mxc")).toBe(1);

    release();
    await Promise.all([started, changed]);
    expect(trustChecks("mxc")).toBe(2);
    expect(mostAtOnce()).toBe(1);
  });

  it("keeps a failed check for this start when two triggers arrive together", async () => {
    const { choice, trustChecks } = machine({
      setting: choose("mxc"),
      backends: { mxc: { check: ok, canary: [tooStrict] } },
    });
    await Promise.all([choice.start(), choice.settingsChanged()]);
    expect(trustChecks("mxc")).toBe(1);
  });

  it("refuses a setting the store gives back that isn't valid, and never picks a sandbox for it", async () => {
    const damaged = { backend: "docker", chosenAt } as unknown as SandboxSetting;
    const { choice } = machine({ setting: damaged });
    await expect(choice.start()).rejects.toThrow(/isn't valid/);
    expect(choice.current()).toBeNull();
  });

  it("needs backends with different ids, and MXC with a canary", () => {
    const srt: SandboxBackend = {
      id: "srt",
      offered: async () => true,
      limits: [],
      sandbox: {
        check: async () => ok,
        open: async () => {
          throw new Error("unused");
        },
      },
    };
    const options = { platform: "linux", settings: { get: async () => null } };
    expect(() => new SandboxChoiceService({ ...options, backends: [srt, srt] })).toThrow(/same id/);
    expect(
      () => new SandboxChoiceService({ ...options, backends: [srt, { ...srt, id: "mxc" }] }),
    ).toThrow(/canary/);
  });

  it("keeps the states to the closed list", () => {
    expect(sandboxBackendStates).toEqual([
      "in-use",
      "available",
      "setup-needed",
      "check-failed",
      "not-available",
    ]);
    expectTypeOf<"off">().not.toMatchTypeOf<SandboxBackendState>();
  });
});
