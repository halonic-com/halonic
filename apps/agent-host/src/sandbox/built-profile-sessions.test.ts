import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Harness, SandboxProfile } from "@halonicjs/ports";
import type { ProfilePlatform } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BridgeTable } from "../bridge/bridge-routes.ts";
import { HostRunInstructions } from "../harness/host-instructions.ts";
import { HostHarnessProfiles } from "../harness/host-profiles.ts";
import { instructionRoutes } from "../harness/instruction-routes.ts";
import { profileRoute } from "../harness/profile-route.ts";
import { CallChannel } from "../server/call-channel.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import type { NdjsonStream } from "../server/ndjson-stream.ts";
import { isBuiltProfile, noBuiltProfiles } from "./built-profiles.ts";
import { FakeSandbox } from "./sandbox-routes.test-helper.ts";
import { sandboxRoutes } from "./sandbox-routes.ts";
import { SessionTable } from "./session-table.ts";

const token = randomLaunchToken();

const claudeCode: Harness = {
  id: "claude-code",
  name: "Claude Code",
  detect: async () => ({ status: "missing" }),
  start: () => {
    throw new Error("not started here");
  },
};

const writer = {
  runId: "run_1",
  hubId: "hub_1",
  agentId: "writer",
  harness: "claude-code",
  workingFolder: null,
  allowedSites: ["example.com"],
  filesFolder: null,
};

function profilePlatformOf(platform: NodeJS.Platform): ProfilePlatform {
  if (platform === "win32") return "windows";
  return platform === "darwin" ? "macos" : "linux";
}

let root: string;
let workspace: string;
let sandbox: FakeSandbox;
let sessions: SessionTable;
let instructions: HostRunInstructions;
let bridgeId: string;
let server: HostServer | undefined;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-built-profiles-")));
  workspace = join(root, "acme");
  await mkdir(workspace);
  await mkdir(join(root, "home"));
  const profile = { platform: profilePlatformOf(process.platform), root: join(root, "data") };
  const profiles = new HostHarnessProfiles({
    // Where a Windows host would find the harness.
    installOf: async () => ({ program: process.execPath, packageFolder: null }),
    profile,
    workspaceRoots: [workspace],
    harnesses: [claudeCode],
    home: join(root, "home"),
    env: { PATH: "/usr/bin" },
    digest: {
      sha256: async (data) =>
        new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
    },
    platform: process.platform,
    onLeftoverTempFolder: () => {},
  });
  instructions = new HostRunInstructions({ profile, workspaceRoots: [workspace] });
  const bridges = new BridgeTable();
  const stream: NdjsonStream = { send: () => {}, end: () => {}, ended: new Promise(() => {}) };
  bridgeId = bridges.add({
    bridge: { url: "http://127.0.0.1:4100", token: "bridge-test-value", close: async () => {} },
    channel: new CallChannel(stream),
    stream,
    bindSession: () => true,
  });
  sandbox = new FakeSandbox();
  sessions = new SessionTable();
  server = await startHostServer(token, [
    ...sandboxRoutes(profiles.removingTempFolders(sandbox), sessions, profiles),
    profileRoute(profiles, bridges, (folder) => instructions.has(folder)),
    ...instructionRoutes(instructions),
  ]);
});

afterEach(async () => {
  await sessions.closeAll();
  await server?.close();
  server = undefined;
  await instructions.stop();
  await rm(root, { recursive: true, force: true });
});

async function post(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server?.url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function built(instructionsFolder: string | null = null): Promise<SandboxProfile> {
  const body = { workspace, agent: writer, bridge: bridgeId, instructionsFolder };
  const answer = await post("/v1/harnesses/profile", body);
  expect(answer.status).toBe(200);
  return (answer.body as { profile: SandboxProfile }).profile;
}

function open(profile: SandboxProfile): Promise<{ status: number; body: unknown }> {
  return post("/v1/sandbox/sessions/open", { profile });
}

const notBuilt = { error: expect.objectContaining({ kind: "profile_not_built" }) };

/** A profile changed in one field from the built one, by name. */
function changes(profile: SandboxProfile): Record<string, SandboxProfile> {
  return {
    workingFolder: { ...profile, workingFolder: join(root, "home") },
    deniedPaths: { ...profile, deniedPaths: [] },
    readOnlyPaths: { ...profile, readOnlyPaths: [...profile.readOnlyPaths, join(root, "home")] },
    settingsFolder: { ...profile, settingsFolder: join(root, "home") },
    allowedSites: { ...profile, network: { ...profile.network, allowedSites: ["*"] } },
    timeLimitMs: { ...profile, timeLimitMs: profile.timeLimitMs + 1 },
    keyStore: { ...profile, keyStore: "allowed" },
  };
}

verifies("agent-host.built-profile-sessions", () => {
  describe("isBuiltProfile", () => {
    const profile: SandboxProfile = {
      workingFolder: "/work",
      tempFolder: "/data/tmp/1",
      settingsFolder: null,
      readOnlyPaths: ["/read"],
      deniedPaths: ["/data"],
      env: { PATH: "/usr/bin" },
      network: { bridge: null, allowedSites: [] },
      timeLimitMs: 60_000,
    };

    it("is the profile as built, and with the harness's variables added", () => {
      expect(isBuiltProfile(profile, { ...profile })).toBe(true);
      const env = { ...profile.env, CLAUDE_CONFIG_DIR: "/data/settings" };
      expect(isBuiltProfile(profile, { ...profile, env })).toBe(true);
    });

    it("is not a profile with any other field changed", () => {
      for (const [field, changed] of Object.entries(changes(profile))) {
        expect({ field, built: isBuiltProfile(profile, changed) }).toEqual({ field, built: false });
      }
    });

    it("is not a profile with a built variable changed or left out, or one added again in another case", () => {
      expect(isBuiltProfile(profile, { ...profile, env: { PATH: "/elsewhere" } })).toBe(false);
      expect(isBuiltProfile(profile, { ...profile, env: {} })).toBe(false);
      const twice = { ...profile.env, Path: "/elsewhere" };
      expect(isBuiltProfile(profile, { ...profile, env: twice })).toBe(false);
    });
  });

  it("opens one session for a profile the host built, with the harness's variables added", async () => {
    const profile = await built();
    const withHarness = { ...profile, env: { ...profile.env, CLAUDE_CONFIG_DIR: "/settings" } };
    expect((await open(withHarness)).status).toBe(200);
    expect(await open(withHarness)).toEqual({ status: 403, body: notBuilt });
    expect(sandbox.openCalls).toBe(1);
  });

  it("opens no session for a profile the host didn't build, or one changed from it", async () => {
    const profile = await built();
    const made = { ...profile, tempFolder: join(root, "elsewhere") };
    expect(await open(made)).toEqual({ status: 403, body: notBuilt });
    for (const changed of Object.values(changes(profile))) {
      expect(await open(changed)).toEqual({ status: 403, body: notBuilt });
    }
    expect(sandbox.openCalls).toBe(0);
    // A refused profile takes nothing: the built one still opens.
    expect((await open(profile)).status).toBe(200);
  });

  it("opens no session at all on a host that builds no profiles", async () => {
    const profile = await built();
    const plain = await startHostServer(token, sandboxRoutes(sandbox, sessions, noBuiltProfiles));
    try {
      const response = await fetch(`${plain.url}/v1/sandbox/sessions/open`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      expect(response.status).toBe(403);
      expect(sandbox.openCalls).toBe(0);
    } finally {
      await plain.close();
    }
  });

  it("builds a profile only with an instructions folder the host made and still has", async () => {
    const files = [{ name: "AGENTS.md", text: "Be brief.\n" }];
    const made = await post("/v1/harnesses/instructions", { workspace, files });
    const { folder } = made.body as { folder: string };
    expect((await built(folder)).readOnlyPaths).toContain(folder);

    const unknown = { error: expect.objectContaining({ kind: "unknown_instructions" }) };
    const other = join(root, "data", "workspaces", "other", "folder");
    await mkdir(other, { recursive: true });
    const body = { workspace, agent: writer, bridge: bridgeId, instructionsFolder: other };
    expect(await post("/v1/harnesses/profile", body)).toEqual({ status: 404, body: unknown });

    await instructions.release(folder);
    const released = { ...body, instructionsFolder: folder };
    expect(await post("/v1/harnesses/profile", released)).toEqual({ status: 404, body: unknown });
  });
});
