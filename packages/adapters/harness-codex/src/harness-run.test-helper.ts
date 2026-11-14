import {
  addHarnessEnvironment,
  type HarnessBridge,
  type HarnessEvent,
  type HarnessRun,
  type HarnessTask,
  type SandboxProfile,
  type SandboxSession,
} from "@halonicjs/ports";
import { type FakeProgram, FakeSandboxSession } from "@halonicjs/testing-contracts";
import { MemorySettingsFolder } from "./fake-codex.test-helper.ts";
import { codexHarness } from "./harness.ts";

/** A probe the run cases never ask: they don't call `detect`. */
const unusedProbe = {
  ask: async () => {
    throw new Error("The run cases don't detect Codex");
  },
};

export function newHarness(settings = new MemorySettingsFolder()) {
  return codexHarness({ probe: unusedProbe, settings, ownSandbox: async () => true });
}

export const task: HarnessTask = {
  runId: "run-1",
  hubId: "acme",
  agentId: "writer",
  instructions: "Answer in one short sentence.",
  prompt: "Name a colour of the sea.",
  model: "gpt-5.5",
};

export const bridge: HarnessBridge = {
  url: "http://127.0.0.1:4100",
  token: `made-up-token-${crypto.randomUUID()}`,
};

export const engineProfile: SandboxProfile = {
  workingFolder: "/agents/writer/work",
  tempFolder: "/sessions/one/temp",
  settingsFolder: "/agents/writer/settings",
  readOnlyPaths: [],
  deniedPaths: [],
  env: { PATH: "/usr/bin", HOME: "/agents/writer/home" },
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

/**
 * What a fake session opens with, the way the engine opens one: `program`
 * runs as `codex`, with the harness's own environment added to the profile's.
 */
export function engineSessionOptions<Program>(
  program: Program,
  profile = engineProfile,
): { profile: SandboxProfile; program: Program } {
  const env = addHarnessEnvironment(profile.env, newHarness().environment?.(bridge, profile) ?? {});
  return { profile: { ...profile, env }, program };
}

/** A session opened the way the engine opens one, running `program` as `codex`. */
export function openSession(program: FakeProgram, profile = engineProfile): FakeSandboxSession {
  return new FakeSandboxSession(engineSessionOptions(program, profile));
}

/**
 * `session`, except that each `kill` of a program it started goes through
 * `kill`, which gets the real one to call.
 */
export function withKill(
  session: SandboxSession,
  kill: (realKill: () => Promise<void>) => Promise<void>,
): SandboxSession {
  return {
    profile: session.profile,
    get fence() {
      return session.fence;
    },
    onBlocked: (listener) => session.onBlocked(listener),
    close: () => session.close(),
    start: async (command) => {
      const process = await session.start(command);
      return {
        stdin: process.stdin,
        stdout: process.stdout,
        stderr: process.stderr,
        exited: process.exited,
        kill: () => kill(() => process.kill()),
      };
    },
  };
}

export async function readAll(
  run: HarnessRun,
): Promise<{ events: HarnessEvent[]; error?: unknown }> {
  const events: HarnessEvent[] = [];
  try {
    for await (const event of run) events.push(event);
  } catch (error) {
    return { events, error };
  }
  return { events };
}
