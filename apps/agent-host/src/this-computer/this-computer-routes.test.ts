import type { Harness, Sandbox, SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BridgeTable } from "../bridge/bridge-routes.ts";
import { harnessRoutes } from "../harness/harness-routes.ts";
import { RunTable } from "../harness/run-table.ts";
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

beforeEach(async () => {
  setup = await thisComputerSetup();
  launched = [];
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await setup.close();
});

/** The launcher, as the host wraps it: its open takes the profile from the unopened ones. */
function fakeLauncher(): Sandbox {
  return {
    check: async () => ({ ok: true, reason: null, missing: [] }),
    capabilities: () => ({ files: "shared", strength: "none" }),
    open: async (profile) => {
      setup.unopened.delete(profile.tempFolder);
      launched.push(profile);
      return { profile, fence: { state: "off" }, close: async () => {} } as SandboxSession;
    },
  };
}

/** A harness that adds no variables and never starts: a start that gets this far is a failure here. */
const harness = {
  id: "claude-code",
  environment: () => ({}),
  start: () => {
    throw new Error("The harness started.");
  },
} as unknown as Harness;

/** Starts the routes; `offered: false` serves them as a host without a launcher. */
async function started(offered = true): Promise<{ url: string; bridges: BridgeTable }> {
  const sessions = new SessionTable();
  const unfenced = new UnfencedSessions(sessions);
  const bridges = new BridgeTable();
  const launcher = offered ? { launcher: fakeLauncher(), gate: setup.gate } : undefined;
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
      const { url } = await started(false);
      const answer = await post(url, "/v1/sandbox/this-computer/open", openBody());
      expect(answer.status).toBe(403);
      expect(await answer.json()).toMatchObject({ error: { kind: "not_offered" } });
    });

    it("answers the gate's refusal and starts nothing", async () => {
      await setup.chooseThisComputer();
      const { url } = await started();
      const answer = await post(url, "/v1/sandbox/this-computer/open", openBody());
      expect(answer.status).toBe(403);
      expect(await answer.json()).toMatchObject({ error: { kind: "workspace_not_trusted" } });
      expect(launched).toEqual([]);
    });

    it("opens one with the launcher once the gate passes, and only once per profile", async () => {
      await setup.trustCoder();
      await setup.chooseThisComputer();
      const { url } = await started();
      const answer = await post(url, "/v1/sandbox/this-computer/open", openBody());
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ session: expect.any(String), fence: { state: "off" } });
      expect(launched).toEqual([setup.built.profile]);

      const again = await post(url, "/v1/sandbox/this-computer/open", openBody());
      expect(await again.json()).toMatchObject({ error: { kind: "profile_not_built" } });
      expect(launched).toHaveLength(1);
    });

    it("refuses to start a run in it with an environment the host didn't make", async () => {
      await setup.trustCoder();
      await setup.chooseThisComputer();
      const { url, bridges } = await started();
      const env = { ...setup.built.profile.env, NODE_OPTIONS: "--require /srv/acme/x.js" };
      const opened = await post(url, "/v1/sandbox/this-computer/open", openBody(env));
      const { session } = (await opened.json()) as { session: string };
      const stream: NdjsonStream = { send: () => {}, end: () => {}, ended: new Promise(() => {}) };
      const bridge = bridges.add({
        bridge: {
          url: "http://127.0.0.1:4100",
          token: "run-token-test-value",
          close: async () => {},
        },
        keyProviders: [],
        channel: new CallChannel(stream),
        stream,
        bindSession: () => true,
      });
      const task = {
        runId: "run_1",
        hubId: "lab",
        agentId: "coder",
        instructions: "",
        prompt: "Go.",
      };
      const answer = await post(url, "/v1/harnesses/runs/start", {
        harness: "claude-code",
        task,
        session,
        bridge,
      });
      expect(answer.status).toBe(403);
      expect(await answer.json()).toMatchObject({ error: { kind: "environment_not_host" } });
    });
  });
});
