import type { SandboxCheck, SandboxFence, SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type CanaryFindings,
  runTrustCheck,
  type TrustCanary,
  type TrustCheckFailure,
  trustCheckFailures,
} from "./sandbox-trust-check.ts";

// Placeholders for a real run's paths: the project folder, and Halonic's
// own folder under %LOCALAPPDATA% on Windows. The fakes don't read them.
const projectFolder = "/acme/project";
const halonicFolder = "/local-app-data/Halonic";

const profile: SandboxProfile = {
  workingFolder: projectFolder,
  tempFolder: `${halonicFolder}/tmp/canary`,
  settingsFolder: null,
  readOnlyPaths: [`${halonicFolder}/canary-read-only`],
  deniedPaths: [`${halonicFolder}/canary-hidden.txt`],
  env: {},
  network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 30_000,
};

const ok: SandboxCheck = { ok: true, reason: null, missing: [] };

const clean: CanaryFindings = {
  started: true,
  leaks: [],
  controls: { readOnlyFileRead: true, workFolderScriptLoaded: true },
  nameLookupsLeave: true,
  missing: [],
};

interface Setup {
  check?: SandboxCheck;
  fence?: SandboxFence;
  openFails?: boolean;
  findings?: CanaryFindings | Error;
}

/** A sandbox and canary that answer as `setup` says, and remember what they opened. */
function fakes(setup: Setup = {}) {
  const opened: FakeSandboxSession[] = [];
  const sandbox = {
    check: async () => setup.check ?? ok,
    open: async (given: SandboxProfile): Promise<SandboxSession> => {
      if (setup.openFails === true) throw new Error("the box didn't start");
      const fence = setup.fence ?? { state: "fenced" };
      const session = new FakeSandboxSession({ profile: given, program: idleProgram, fence });
      opened.push(session);
      return session;
    },
  };
  const canary: TrustCanary = {
    profile: async () => profile,
    probe: async () => {
      const findings = setup.findings ?? clean;
      if (findings instanceof Error) throw findings;
      return findings;
    },
  };
  return { sandbox, canary, opened };
}

verifies("app.sandbox-trust-check", () => {
  it("passes a fenced canary session with no leaks and both controls working, and closes it", async () => {
    const { sandbox, canary, opened } = fakes();
    expect(await runTrustCheck(sandbox, canary)).toEqual({ passed: true, nameLookupsLeave: true });
    expect(opened[0]?.profile).toBe(profile);
    expect(opened[0]?.fence).toEqual({ state: "stopped" });
  });

  it("fails with too-strict when nothing leaked but a control failed", async () => {
    for (const controls of [
      { readOnlyFileRead: false, workFolderScriptLoaded: true },
      { readOnlyFileRead: true, workFolderScriptLoaded: false },
    ]) {
      const missing = ["the read-only file couldn't be read"];
      const { sandbox, canary } = fakes({ findings: { ...clean, controls, missing } });
      expect(await runTrustCheck(sandbox, canary)).toEqual({
        passed: false,
        reason: "too-strict",
        missing,
      });
    }
  });

  it("reports a leak before a failed control", async () => {
    const controls = { readOnlyFileRead: false, workFolderScriptLoaded: false };
    const { sandbox, canary } = fakes({
      findings: { ...clean, leaks: ["file-readable"], controls },
    });
    expect(await runTrustCheck(sandbox, canary)).toMatchObject({ reason: "file-readable" });
  });

  it("reports the first leak in the list's order", async () => {
    const { sandbox, canary } = fakes({
      findings: { ...clean, leaks: ["dns-reachable", "port-reachable"] },
    });
    expect(await runTrustCheck(sandbox, canary)).toMatchObject({ reason: "port-reachable" });
  });

  it("fails with did-not-start when the session can't open or the probe program didn't start", async () => {
    const notOpened = fakes({ openFails: true });
    expect(await runTrustCheck(notOpened.sandbox, notOpened.canary)).toEqual({
      passed: false,
      reason: "did-not-start",
      missing: ["the box didn't start"],
    });

    const notStarted = fakes({ findings: { started: false, missing: ["node.exe not found"] } });
    expect(await runTrustCheck(notStarted.sandbox, notStarted.canary)).toMatchObject({
      reason: "did-not-start",
      missing: ["node.exe not found"],
    });
    expect(notStarted.opened[0]?.fence).toEqual({ state: "stopped" });
  });

  it("fails with other when the backend's check fails, the profile can't be built or the probe throws", async () => {
    const check: SandboxCheck = {
      ok: false,
      reason: "windows",
      missing: ["no BaseContainer tier"],
    };
    const checkFails = fakes({ check });
    expect(await runTrustCheck(checkFails.sandbox, checkFails.canary)).toEqual({
      passed: false,
      reason: "other",
      missing: ["no BaseContainer tier"],
    });
    expect(checkFails.opened).toEqual([]);

    const noProfile = fakes();
    noProfile.canary.profile = async () => {
      throw new Error("no project folder");
    };
    expect(await runTrustCheck(noProfile.sandbox, noProfile.canary)).toMatchObject({
      reason: "other",
      missing: ["no project folder"],
    });

    const probeThrows = fakes({ findings: new Error("probe crashed") });
    expect(await runTrustCheck(probeThrows.sandbox, probeThrows.canary)).toMatchObject({
      reason: "other",
      missing: ["probe crashed"],
    });
    expect(probeThrows.opened[0]?.fence).toEqual({ state: "stopped" });
  });

  it("fails with other when only the fence proof failed", async () => {
    const fence: SandboxFence = { state: "not-fenced", reason: "the canary port answered" };
    const { sandbox, canary } = fakes({ fence });
    expect(await runTrustCheck(sandbox, canary)).toEqual({
      passed: false,
      reason: "other",
      missing: ["the canary port answered"],
    });
  });

  it("fails with other when the sandbox has no fence at all", async () => {
    const { sandbox, canary } = fakes({ fence: { state: "off" } });
    expect(await runTrustCheck(sandbox, canary)).toEqual({
      passed: false,
      reason: "other",
      missing: ["the fence proof is off"],
    });
  });

  it("passes when name lookups leave through the system's DNS service, and says whether they do", async () => {
    const { sandbox, canary } = fakes({ findings: { ...clean, nameLookupsLeave: false } });
    expect(await runTrustCheck(sandbox, canary)).toEqual({ passed: true, nameLookupsLeave: false });
  });

  it("keeps its reasons to the closed list, leaks first", () => {
    expect(trustCheckFailures).toEqual([
      "file-readable",
      "file-writable",
      "port-reachable",
      "internet-reachable",
      "dns-reachable",
      "too-strict",
      "did-not-start",
      "other",
    ]);
    expectTypeOf<"leaked">().not.toMatchTypeOf<TrustCheckFailure>();
  });
});
