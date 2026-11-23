import type { Harness, Sandbox, SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BridgeTable } from "../bridge/bridge-routes.ts";
import { harnessRoutes } from "../harness/harness-routes.ts";
import { RunTable } from "../harness/run-table.ts";
import type { BuiltProfiles } from "../sandbox/built-profiles.ts";
import { SessionTable } from "../sandbox/session-table.ts";
import { CallChannel } from "../server/call-channel.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import type { NdjsonStream } from "../server/ndjson-stream.ts";
import { type ThisComputerSetup, thisComputerSetup } from "./this-computer.test-helper.ts";
import { thisComputerRoutes } from "./this-computer-routes.ts";
import { UnfencedSessions } from "./unfenced-sessions.ts";

const token = randomLaunchToken();
const authorization = { authorization: `Bearer ${token}` };

let setup: ThisComputerSetup;
let server: HostServer | undefined;
/** The profiles the fake launcher opened sessions with. */
let launched: SandboxProfile[];
/** How many times the harness was asked to start a program. */
let starts: number;

beforeEach(async () => {
  setup = await thisComputerSetup();
  launched = [];
  starts = 0;
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await setup.close();
});

/** A launcher that opens a session without a fence and starts nothing. */
const fakeLauncher: Sandbox = {
  check: async () => ({ ok: true, reason: null, missing: [] }),
  capabilities: () => ({ files: "shared", strength: "none" }),
  open: async (profile) => {
    launched.push(profile);
    return { profile, fence: { state: "off" }, close: async () => {} } as SandboxSession;
  },
};

/** The builder's profiles, as the setup keeps them: taking one removes it. */
function builtProfiles(): BuiltProfiles {
  return { take: (profile) => setup.unopened.delete(profile.tempFolder) };
}

/** A harness that adds no variables and counts its starts. */
const harness = {
  id: "claude-code",
  environment: () => ({}),
  start: () => {
    starts += 1;
    throw new Error("The harness started.");
  },
} as unknown as Harness;

/** Starts the routes; `offered: false` serves them as a host without a launcher. */
async function started(offered = true): Promise<{ url: string; bridges: BridgeTable }> {
  const sessions = new SessionTable();
  const unfenced = new UnfencedSessions(sessions);
  const bridges = new BridgeTable();
  const launcher = offered
    ? { launcher: fakeLauncher, gate: setup.gate, built: builtProfiles() }
    : undefined;
  server = await startHostServer(token, [
    ...thisComputerRoutes(launcher, sessions, unfenced),
    ...harnessRoutes({ harnesses: [harness], sessions, bridges, runs: new RunTable(), unfenced }),
  ]);
  return { url: server.url, bridges };
}

function post(url: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function openBody(env: Record<string, string> = setup.built.profile.env) {
  return {
    workspace: setup.root,
    hubId: "lab",
    agentId: "coder",
    profile: { ...setup.built.profile, env },
  };
}

/** Lets the coder out: trusted, its instructions trusted, and set to "On this computer". */
async function letCoderOut(): Promise<void> {
  await setup.trustCoder();
  await setup.trustCoderInstructions();
  await setup.chooseThisComputer();
}

/** Opens a session for the coder and starts a run in it, and answers the start. */
async function startRunIn(env: Record<string, string>): Promise<Response> {
  const { url, bridges } = await started();
  const opened = await post(url, "/v1/sandbox/this-computer/open", openBody(env));
  const { session } = (await opened.json()) as { session: string };
  const stream: NdjsonStream = { send: () => {}, end: () => {}, ended: new Promise(() => {}) };
  const bridge = bridges.add({
    bridge: { url: "http://127.0.0.1:4100", token: "run-token-test-value", close: async () => {} },
    keyProviders: [],
    channel: new CallChannel(stream),
    stream,
    bindSession: () => true,
  });
  const task = { runId: "run_1", hubId: "lab", agentId: "coder", instructions: "", prompt: "Go." };
  return post(url, "/v1/harnesses/runs/start", { harness: "claude-code", task, session, bridge });
}

verifies("agent-host.this-computer-sessions", () => {
  describe("thisComputerRoutes", () => {
    it("says whether the host offers sessions on this computer", async () => {
      const { url } = await started();
      const answer = await fetch(`${url}/v1/sandbox/this-computer`, { headers: authorization });
      expect(await answer.json()).toEqual({ offered: true });
      await server?.close();

      const without = await started(false);
      const none = await fetch(`${without.url}/v1/sandbox/this-computer`, {
        headers: authorization,
      });
      expect(await none.json()).toEqual({ offered: false });
    });

    it("refuses to open one where it offers none", async () => {
      await letCoderOut();
      const { url } = await started(false);
      const answer = await post(url, "/v1/sandbox/this-computer/open", openBody());
      expect(answer.status).toBe(403);
      expect(await answer.json()).toMatchObject({ error: { kind: "not_offered" } });
      expect(launched).toEqual([]);
    });

    it("answers the gate's refusal and starts nothing", async () => {
      await setup.chooseThisComputer();
      const { url } = await started();
      const answer = await post(url, "/v1/sandbox/this-computer/open", openBody());
      expect(answer.status).toBe(403);
      expect(await answer.json()).toMatchObject({ error: { kind: "workspace_not_trusted" } });
      expect(launched).toEqual([]);
      expect(setup.unopened.has(setup.built.profile.tempFolder)).toBe(true);
    });

    it("opens one with the launcher once the gate passes, and only once per profile", async () => {
      await letCoderOut();
      const { url } = await started();
      const answer = await post(url, "/v1/sandbox/this-computer/open", openBody());
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ session: expect.any(String), fence: { state: "off" } });
      expect(launched).toEqual([setup.built.profile]);

      const again = await post(url, "/v1/sandbox/this-computer/open", openBody());
      expect(again.status).toBe(403);
      expect(await again.json()).toMatchObject({ error: { kind: "profile_not_built" } });
      expect(launched).toHaveLength(1);
    });

    it("starts a run in it with the host's own environment", async () => {
      await letCoderOut();
      const answer = await startRunIn(setup.built.profile.env);
      expect(answer.status).toBe(200);
      await answer.text();
      expect(starts).toBe(1);
    });

    it("refuses to start a run in it with an environment the host didn't make", async () => {
      await letCoderOut();
      const env = { ...setup.built.profile.env, NODE_OPTIONS: "--require /srv/acme/x.js" };
      const answer = await startRunIn(env);
      expect(answer.status).toBe(403);
      expect(await answer.json()).toMatchObject({ error: { kind: "environment_not_host" } });
      expect(starts).toBe(0);
    });
  });
});
