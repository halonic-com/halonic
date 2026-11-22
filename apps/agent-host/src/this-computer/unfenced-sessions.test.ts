import type { Harness, HarnessTask, SandboxFence, SandboxSession } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { BuiltProfile } from "../harness/host-profiles.ts";
import { SessionTable } from "../sandbox/session-table.ts";
import { UnfencedSessions } from "./unfenced-sessions.ts";

const bridge = { url: "http://127.0.0.1:4100", token: "run-token-test-value" };
const task = { model: "claude-sonnet-5-5", modelForEveryCall: true } as HarnessTask;

const built: BuiltProfile = {
  workspace: "/work/acme",
  agent: {
    runId: "run_1",
    hubId: "lab",
    agentId: "coder",
    harness: "claude-code",
    workingFolder: null,
    allowedSites: [],
    filesFolder: null,
  },
  profile: {
    workingFolder: "/work/acme/files/agents/coder",
    tempFolder: "/data/tmp-1",
    settingsFolder: "/data/settings",
    readOnlyPaths: [],
    deniedPaths: [],
    env: { PATH: "/usr/bin", HOME: "/srv/acme-home" },
    network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 60_000,
  },
};

/** A harness whose variables name the bridge, the temp folder and the task's model. */
const harness = {
  id: "claude-code",
  environment: (
    on: { url: string; token: string },
    folders: { tempFolder: string },
    model?: Pick<HarnessTask, "model">,
  ) => ({
    BRIDGE_URL: on.url,
    BRIDGE_TOKEN: on.token,
    PROGRAM_TMPDIR: folders.tempFolder,
    ...(model?.model === undefined ? {} : { PROGRAM_MODEL: model.model }),
  }),
} as unknown as Harness;

/** The environment the engine gives the session: the host's profile and the harness's variables. */
const hostEnvironment: Record<string, string> = {
  ...built.profile.env,
  BRIDGE_URL: bridge.url,
  BRIDGE_TOKEN: bridge.token,
  PROGRAM_TMPDIR: built.profile.tempFolder,
  PROGRAM_MODEL: "claude-sonnet-5-5",
};

function sessionWith(env: Record<string, string>, fence: SandboxFence): SandboxSession {
  return { profile: { ...built.profile, env }, fence, close: async () => {} } as SandboxSession;
}

/** A table with one session, kept in `UnfencedSessions` as the gate's route keeps it when `vetted`. */
async function opened(
  env: Record<string, string>,
  vetted = true,
  fence: SandboxFence = { state: "off" },
) {
  const sessions = new SessionTable();
  const unfenced = new UnfencedSessions(sessions);
  const session = sessionWith(env, fence);
  const sessionId = (await sessions.add(session)) ?? "";
  if (vetted) unfenced.add(sessionId, built);
  const refusal = () => unfenced.startRefusal({ sessionId, session, harness, task, bridge });
  return { sessions, sessionId, refusal };
}

verifies("agent-host.this-computer-sessions", () => {
  describe("UnfencedSessions.startRefusal", () => {
    it("lets a run start with exactly the host's profile and the harness's own variables", async () => {
      const { refusal } = await opened(hostEnvironment);
      expect(refusal()).toBeUndefined();
    });

    it("refuses a variable the page added, such as NODE_OPTIONS", async () => {
      const { refusal } = await opened({ ...hostEnvironment, NODE_OPTIONS: "--require /srv/acme/x.js" });
      expect(refusal()).toMatch(/isn't the one the agent host gives/);
    });

    it("refuses a host variable the page changed or left out, such as PATH", async () => {
      expect(
        (await opened({ ...hostEnvironment, PATH: "/srv/acme/bin:/usr/bin" })).refusal(),
      ).toBeDefined();
      const { PATH: _path, ...withoutPath } = hostEnvironment;
      expect((await opened(withoutPath)).refusal()).toBeDefined();
    });

    it("refuses a harness variable that names another bridge or model", async () => {
      expect(
        (await opened({ ...hostEnvironment, BRIDGE_URL: "http://127.0.0.1:9" })).refusal(),
      ).toBeDefined();
      expect(
        (await opened({ ...hostEnvironment, PROGRAM_MODEL: "other" })).refusal(),
      ).toBeDefined();
    });

    it("refuses a session without a fence the gate didn't open, and leaves a fenced one to its fence", async () => {
      expect((await opened(hostEnvironment, false)).refusal()).toMatch(/didn't open this session/);
      const fenced = await opened({ ANYTHING: "1" }, false, { state: "fenced" });
      expect(fenced.refusal()).toBeUndefined();
    });

    it("forgets the session's profile once it closes", async () => {
      const { sessions, sessionId, refusal } = await opened(hostEnvironment);
      await sessions.close(sessionId);
      expect(refusal()).toMatch(/didn't open this session/);
    });
  });
});
