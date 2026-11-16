import { FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  choose,
  chosenAt,
  clean,
  inContainer,
  type Machine,
  machine,
  needsSetup,
  ok,
  profile,
  sessions,
  statusOf,
  tooStrict,
} from "./sandbox-choice.test-helper.ts";
import {
  defaultBackendOrder,
  type SandboxBackendState,
  type SandboxBackendStatus,
  SandboxChoiceService,
  type SecurityUpdatesState,
  sandboxBackendStates,
} from "./sandbox-choice.ts";

sessions.open = (opened) => new FakeSandboxSession({ profile: opened, program: idleProgram });

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

  it("adds security-updates-overdue as a residual, with the last date or none", async () => {
    const overdue = async (securityUpdates: SecurityUpdatesState | Error) => {
      const { choice } = machine({
        platform: "win32",
        backends: { "srt-wsl": { check: ok, securityUpdates } },
      });
      const status = statusOf(await choice.start(), "srt-wsl");
      if (status === undefined) throw new Error("srt-wsl has no status");
      return status as SandboxBackendStatus;
    };
    expect(await overdue({ overdue: true, last: "2026-11-01T03:00:00Z" })).toMatchObject({
      state: "in-use",
      residuals: ["name-lookups-leave", "security-updates-overdue"],
      securityUpdatesLast: "2026-11-01T03:00:00Z",
    });
    // Never ran or unknown: no date, not an empty string. The same for a call that fails.
    for (const state of [{ overdue: true, last: null } as const, new Error("wsl.exe failed")]) {
      const status = await overdue(state);
      expect(status).toMatchObject({ state: "in-use", securityUpdatesLast: null });
      expect(status.residuals).toContain("security-updates-overdue");
    }
    const current = await overdue({ overdue: false });
    expect(current.residuals).not.toContain("security-updates-overdue");
    expect(current).not.toHaveProperty("securityUpdatesLast");
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

  it("trust-checks srt too: a leak keeps it off and nothing else runs", async () => {
    const hiddenFileRead: CanaryFindings = { ...clean, leaks: ["file-readable"] };
    const { choice } = machine({
      platform: "linux",
      backends: { srt: { check: ok, canary: [hiddenFileRead] }, mxc: { check: ok } },
    });
    const result = await choice.start();
    expect(result.active).toBeNull();
    expect(statusOf(result, "srt")).toMatchObject({
      state: "check-failed",
      reason: "file-readable",
    });
    expect(statusOf(result, "mxc")).toMatchObject({ state: "available" });
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
    await waitUntil(`trustChecks("mxc") to be 1`, () => trustChecks("mxc") === 1);
    expect(trustChecks("mxc")).toBe(1);
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

  it("needs backends with different ids, and every backend with a canary", () => {
    const srt = {
      id: "srt",
      offered: async () => true,
      limits: [],
      sandbox: {
        check: async () => ok,
        open: async () => {
          throw new Error("unused");
        },
      },
    } satisfies Omit<SandboxBackend, "canary">;
    const withCanary: SandboxBackend = {
      ...srt,
      canary: { profile: async () => profile, probe: async () => clean },
    };
    const options = { platform: "linux", settings: { get: async () => null } };
    expect(
      () => new SandboxChoiceService({ ...options, backends: [withCanary, withCanary] }),
    ).toThrow(/same id/);
    expect(
      () => new SandboxChoiceService({ ...options, backends: [srt as unknown as SandboxBackend] }),
    ).toThrow(/srt sandbox backend has no trust canary/);
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

  it("says setup-needed, with no check and no trust check, when the chosen backend isn't downloaded", async () => {
    const { choice, trustChecks, ownChecks, downloadTries } = machine({
      setting: choose("mxc"),
      backends: { srt: { check: ok }, mxc: { check: ok, canary: [clean], needsDownload: true } },
    });
    const started = await choice.start();
    // A pending download never falls through to srt.
    expect(started.active).toBeNull();
    expect(statusOf(started, "mxc")).toEqual({
      id: "mxc",
      offered: true,
      state: "setup-needed",
      reason: "download-needed",
      setup: "download",
      missing: [],
      limits: [],
      residuals: [],
    });
    expect(ownChecks("mxc")).toBe(0);
    expect(trustChecks("mxc")).toBe(0);
    expect(downloadTries("mxc")).toBe(0);
  });

  it("downloads nothing at start, on a settings change or when a session isn't fenced", async () => {
    const { choice, downloadTries, saves } = machine({
      backends: { srt: { check: ok }, mxc: { check: ok, canary: [clean], needsDownload: true } },
    });
    expect(await choice.start()).toMatchObject({ active: "srt" });
    saves(choose("mxc"));
    expect(await choice.settingsChanged()).toMatchObject({ active: null });
    await choice.sessionNotFenced();
    expect(downloadTries("mxc")).toBe(0);
  });

  it("downloads when asked, then chooses again from the saved setting and uses the backend", async () => {
    const { choice, trustChecks, downloadTries, saves } = machine({
      backends: { srt: { check: ok }, mxc: { check: ok, canary: [clean], needsDownload: true } },
    });
    await choice.start();
    saves(choose("mxc"));
    expect(await choice.download("mxc")).toMatchObject({ active: "mxc", setting: choose("mxc") });
    expect(downloadTries("mxc")).toBe(1);
    expect(trustChecks("mxc")).toBe(1);
    expect((await choice.sessionNotFenced()).active).toBe("mxc");
  });

  it("stays setup-needed with the sentence when the download fails, offline or not, and can try again", async () => {
    const { choice, downloadTries } = machine({
      setting: choose("mxc"),
      backends: {
        mxc: {
          check: ok,
          canary: [clean],
          needsDownload: true,
          downloads: [{ done: false, problem: "koffi: fetch failed" }, { done: true }],
        },
      },
    });
    await choice.start();
    const failed = await choice.download("mxc");
    expect(failed.active).toBeNull();
    expect(statusOf(failed, "mxc")).toMatchObject({
      state: "setup-needed",
      reason: "download-needed",
      setup: "download",
      missing: ["koffi: fetch failed"],
    });
    expect(await choice.download("mxc")).toMatchObject({ active: "mxc" });
    expect(downloadTries("mxc")).toBe(2);
  });

  it("downloads nothing when the backend doesn't need it, and refuses a backend it doesn't have", async () => {
    const { choice, downloadTries } = machine({
      setting: choose("mxc"),
      backends: { mxc: { check: ok, canary: [clean], needsDownload: false } },
    });
    await choice.start();
    expect(await choice.download("mxc")).toMatchObject({ active: "mxc" });
    expect(downloadTries("mxc")).toBe(0);
    await expect(choice.download("srt")).rejects.toThrow(/missing/);
  });
});
