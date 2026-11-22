import type {
  Harness,
  HarnessTask,
  SandboxFence,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { SessionTable } from "../sandbox/session-table.ts";
import { UnfencedSessions } from "./unfenced-sessions.ts";

const bridge = { url: "http://127.0.0.1:4100", token: "run-token-test-value" };
/** The instructions folder the host made and built the session's profile with. */
const hostInstructions = "/data/harness-tmp/instructions-1";
const task = {
  hubId: "acme",
  agentId: "coder",
  instructionsFolder: hostInstructions,
  model: "claude-sonnet-5-5",
  modelForEveryCall: true,
} as HarnessTask;

/** The profile the host built for the session. */
const built: SandboxProfile = {
  workingFolder: "/work/acme/files/agents/coder",
  tempFolder: "/data/tmp-1",
  settingsFolder: "/data/settings",
  readOnlyPaths: [],
  deniedPaths: [],
  env: { PATH: "/usr/bin", HOME: "/srv/acme-home" },
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
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
  ...built.env,
  BRIDGE_URL: bridge.url,
  BRIDGE_TOKEN: bridge.token,
  PROGRAM_TMPDIR: built.tempFolder,
  PROGRAM_MODEL: "claude-sonnet-5-5",
};

function sessionWith(env: Record<string, string>, fence: SandboxFence): SandboxSession {
  return { profile: { ...built, env }, fence, close: async () => {} } as SandboxSession;
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
  if (vetted) {
    unfenced.add(sessionId, {
      profile: built,
      hubId: "acme",
      agentId: "coder",
      instructionsFolder: hostInstructions,
    });
  }
  const refuse = (startTask: HarnessTask) =>
    unfenced.startRefusal({ sessionId, session, harness, task: startTask, bridge });
  const refusal = (changed: Partial<HarnessTask> = {}) => refuse({ ...task, ...changed });
  return { sessions, sessionId, refusal, refuse };
}

verifies("agent-host.unfenced-start", () => {
  describe("UnfencedSessions.startRefusal", () => {
    it("lets a run start with exactly the host's profile and the harness's own variables", async () => {
      const { refusal } = await opened(hostEnvironment);
      expect(refusal()).toBeUndefined();
    });

    it("refuses a variable the page added, such as NODE_OPTIONS", async () => {
      const { refusal } = await opened({
        ...hostEnvironment,
        NODE_OPTIONS: "--require /srv/acme/x.js",
      });
      expect(refusal()).toEqual({
        code: "environment_not_host",
        message: expect.stringMatching(/isn't the one the agent host gives/),
      });
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
      expect((await opened(hostEnvironment, false)).refusal()?.message).toMatch(
        /didn't open this session/,
      );
      const fenced = await opened({ ANYTHING: "1" }, false, { state: "fenced" });
      expect(fenced.refusal()).toBeUndefined();
    });

    it("forgets the session's profile once it closes", async () => {
      const { sessions, sessionId, refusal } = await opened(hostEnvironment);
      await sessions.close(sessionId);
      expect(refusal()?.message).toMatch(/didn't open this session/);
    });

    it("refuses an instructions folder the host didn't build the session with, such as a plugin with hooks", async () => {
      const { refusal, refuse } = await opened(hostEnvironment);
      // A folder holding `hooks/hooks.json` would become Claude Code's `--plugin-dir`.
      expect(refusal({ instructionsFolder: "/work/acme/downloads/plugin" })).toEqual({
        code: "task_not_host",
        message: expect.stringMatching(/instructions folder isn't the one/),
      });
      const { instructionsFolder: _folder, ...withoutFolder } = task;
      expect(refuse(withoutFolder)).toBeUndefined();
    });

    it("refuses a task naming another agent than the one the gate let out", async () => {
      const { refusal } = await opened(hostEnvironment);
      expect(refusal({ agentId: "writer" })?.code).toBe("task_not_host");
      expect(refusal({ hubId: "other" })?.code).toBe("task_not_host");
    });
  });
});
