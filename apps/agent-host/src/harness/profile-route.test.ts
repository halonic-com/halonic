import { mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Harness, Sandbox, SandboxProfile, SandboxSession } from "@halonicjs/ports";
import type { ProfilePlatform } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { BridgeTable } from "../bridge/bridge-routes.ts";
import { CallChannel } from "../server/call-channel.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import type { NdjsonStream } from "../server/ndjson-stream.ts";
import { HostHarnessProfiles, type HostHarnessProfilesOptions } from "./host-profiles.ts";
import { profileRoute } from "./profile-route.ts";

const token = randomLaunchToken();
/** The fake bridge's token. Not a real credential. */
const bridgeToken = "bridge-test-value";

const claudeCode: Harness = {
  id: "claude-code",
  name: "Claude Code",
  detect: async () => ({ status: "missing" }),
  start: () => {
    throw new Error("not started here");
  },
};

/** A harness that starts from a program that is there, as a Windows host would find it. */
const installedHere = {
  installOf: async () => ({ program: process.execPath, packageFolder: null }),
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

const onWindows = process.platform === "win32";
const profilePlatform = profilePlatformOf(process.platform);

function profilePlatformOf(platform: NodeJS.Platform): ProfilePlatform {
  if (platform === "win32") return "windows";
  return platform === "darwin" ? "macos" : "linux";
}

let root: string;
let workspace: string;
let server: HostServer | undefined;
let profiles: HostHarnessProfiles;
let bridgeId: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-profile-route-")));
  workspace = join(root, "acme");
  await mkdir(workspace);
  await mkdir(join(root, "home"));
  profiles = hostProfiles(process.platform);
  const bridges = new BridgeTable();
  const stream: NdjsonStream = { send: () => {}, end: () => {}, ended: new Promise(() => {}) };
  bridgeId = bridges.add({
    bridge: { url: "http://127.0.0.1:4100", token: bridgeToken, close: async () => {} },
    channel: new CallChannel(stream),
    stream,
  });
  server = await startHostServer(token, [profileRoute(profiles, bridges)]);
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(root, { recursive: true, force: true });
});

/**
 * @param withInstall - how the harness starts here; left out, the host's own, which refuses on Windows
 */
function hostProfiles(
  platform: NodeJS.Platform,
  withInstall: Partial<Pick<HostHarnessProfilesOptions, "installOf">> = installedHere,
): HostHarnessProfiles {
  return new HostHarnessProfiles({
    ...withInstall,
    profile: { platform: profilePlatform, root: join(root, "data") },
    workspaceRoots: [workspace],
    harnesses: [claudeCode],
    home: join(root, "home"),
    env: { PATH: "/usr/bin" },
    digest: {
      sha256: async (data) =>
        new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
    },
    platform,
    onLeftoverTempFolder: () => {},
  });
}

function ask(body: unknown): Promise<Response> {
  return fetch(`${server?.url}/v1/harnesses/profile`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(
    () => true,
    () => false,
  );
}

verifies("agent-host.profile-route", () => {
  it("answers the profile of a named workspace, without the bridge's token", async () => {
    const response = await ask({ workspace, agent: writer, bridge: bridgeId });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain(bridgeToken);
    const { profile, deniedGroups } = JSON.parse(text) as {
      profile: SandboxProfile;
      deniedGroups: { code: string; paths: string[] }[];
    };
    expect(profile.workingFolder.startsWith(workspace)).toBe(true);
    expect(profile.network).toEqual({
      bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 },
      allowedSites: ["example.com"],
    });
    expect(profile.env["PATH"]).toBe("/usr/bin");
    // On Windows the data folder is denied by its entries, not as a whole.
    if (!onWindows) expect(profile.deniedPaths).toContain(join(root, "data"));
    expect(deniedGroups.map(({ code }) => code)).toContain("halonic-data");
    expect(await exists(profile.tempFolder)).toBe(true);
  });

  it("answers 404 for a folder the launcher did not name, and makes nothing for it", async () => {
    const other = join(root, "other");
    await mkdir(other);
    const response = await ask({ workspace: other, agent: writer, bridge: bridgeId });
    expect(response.status).toBe(404);
    expect(await exists(join(root, "data"))).toBe(false);
  });

  it("answers 404 for a harness the host does not have and a bridge that is not open", async () => {
    const harness = await ask({
      workspace,
      agent: { ...writer, harness: "other" },
      bridge: bridgeId,
    });
    expect(harness.status).toBe(404);
    const bridge = await ask({ workspace, agent: writer, bridge: "no-such-bridge" });
    expect(bridge.status).toBe(404);
  });

  it("answers 422 with the builder's reason for a working folder outside the workspace", async () => {
    const agent = { ...writer, workingFolder: "../elsewhere" };
    const response = await ask({ workspace, agent, bridge: bridgeId });
    expect(response.status).toBe(422);
    const { error } = (await response.json()) as { error: { kind: string } };
    expect(error.kind).toBe("profile_refused");
  });

  it("refuses a body with a field it does not know, such as a data folder", async () => {
    const response = await ask({ workspace, agent: writer, bridge: bridgeId, halonicData: root });
    expect(response.status).toBe(400);
  });

  it("answers 422 on Windows until the host finds where the harness is installed", async () => {
    const bridges = new BridgeTable();
    const stream: NdjsonStream = { send: () => {}, end: () => {}, ended: new Promise(() => {}) };
    const bridge = bridges.add({
      bridge: { url: "http://127.0.0.1:4100", token: bridgeToken, close: async () => {} },
      channel: new CallChannel(stream),
      stream,
    });
    const windows = await startHostServer(token, [
      profileRoute(hostProfiles("win32", {}), bridges),
    ]);
    try {
      const response = await fetch(`${windows.url}/v1/harnesses/profile`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ workspace, agent: writer, bridge }),
      });
      expect(response.status).toBe(422);
    } finally {
      await windows.close();
    }
  });

  it("removes the temp folder of a closed session, and only the ones it made", async () => {
    const response = await ask({ workspace, agent: writer, bridge: bridgeId });
    const { profile } = (await response.json()) as { profile: SandboxProfile };
    const stranger = join(root, "stranger");
    await mkdir(stranger);
    const sandbox = profiles.removingTempFolders(opening());
    const mine = await sandbox.open(profile);
    const theirs = await sandbox.open({ ...profile, tempFolder: stranger });
    await mine.close();
    await theirs.close();
    expect(await exists(profile.tempFolder)).toBe(false);
    expect(await exists(stranger)).toBe(true);
  });
});

/** A sandbox that opens sessions which only close. */
function opening(): Sandbox {
  return {
    check: async () => ({ ok: true }) as Awaited<ReturnType<Sandbox["check"]>>,
    capabilities: () => ({}) as ReturnType<Sandbox["capabilities"]>,
    open: async (profile) => ({ profile, close: async () => {} }) as unknown as SandboxSession,
  };
}
