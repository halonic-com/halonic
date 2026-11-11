import type {
  Sandbox,
  SandboxCheck,
  SandboxProfile,
  SandboxUnavailableReason,
} from "@halonicjs/ports";
import { FakeSandboxSession, idleProgram } from "./fake-sandbox-session.ts";
import { sandboxCheckContract, sandboxFenceContract } from "./sandbox.ts";

/** A sandbox that only checks: it can start, or can't for `reason`, and never opens a session. */
function checkOnlySandbox(reason: SandboxUnavailableReason | null): Sandbox {
  const check: SandboxCheck =
    reason === null
      ? { ok: true, reason: null, missing: [] }
      : { ok: false, reason, missing: [`the sandbox can't start here (${reason})`] };
  return {
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: "os" }),
    open: async () => {
      throw new Error(check.ok ? "this fake opens no session" : check.missing.join("; "));
    },
  };
}

// The suite on its own fakes, until the first adapter runs it (HAL-193).
sandboxCheckContract("fake that can start", {
  make: async () => checkOnlySandbox(null),
  makeUnavailable: async () => checkOnlySandbox("bubblewrap-missing"),
});

sandboxCheckContract("fake on plain Windows", {
  make: async () => checkOnlySandbox("windows"),
  makeUnavailable: async () => checkOnlySandbox("windows"),
});

const profile: SandboxProfile = {
  workingFolder: "/contract/work",
  tempFolder: "/contract/temp",
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 1000,
};

let notFenced: FakeSandboxSession | undefined;

// The fence suite on the fake session, until an adapter runs it too.
sandboxFenceContract("fake session", {
  openNotFenced: async () => {
    notFenced = new FakeSandboxSession({
      profile,
      program: idleProgram,
      fence: { state: "not-fenced", reason: "the canary file was readable" },
    });
    return notFenced;
  },
  startedPrograms: () => notFenced?.started.length ?? 0,
});
