import { mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Harness } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { HostHarnessProfiles } from "./host-profiles.ts";
import { settingsFolderRoute } from "./settings-folder-route.ts";

const token = randomLaunchToken();

const notStarted = () => {
  throw new Error("not started here");
};

const claudeCode: Harness = {
  id: "claude-code",
  name: "Claude Code",
  signIn: { program: "claude", args: ["auth", "login"], folderVariable: "CLAUDE_CONFIG_DIR" },
  detect: async () => ({ status: "missing" }),
  start: notStarted,
};

/** Codex here has no sign-in of its own, so the host has no folder to give for it. */
const codexWithoutSignIn: Harness = {
  id: "codex",
  name: "Codex",
  detect: async () => ({ status: "missing" }),
  start: notStarted,
};

let root: string;
let workspace: string;
let server: HostServer | undefined;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-settings-folder-route-")));
  workspace = join(root, "acme");
  await mkdir(workspace);
  const profiles = new HostHarnessProfiles({
    profile: { platform: profilePlatform(), root: join(root, "data") },
    workspaceRoots: [workspace],
    harnesses: [claudeCode, codexWithoutSignIn],
    home: join(root, "home"),
    env: {},
    digest: {
      sha256: async (data) =>
        new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
    },
    platform: process.platform,
    onLeftoverTempFolder: () => {},
  });
  server = await startHostServer(token, [settingsFolderRoute(profiles)]);
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(root, { recursive: true, force: true });
});

function profilePlatform() {
  if (process.platform === "win32") return "windows";
  return process.platform === "darwin" ? "macos" : "linux";
}

function ask(body: unknown): Promise<Response> {
  return fetch(`${server?.url}/v1/harnesses/settings-folder`, {
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

verifies("agent-host.settings-folder-route", () => {
  it("answers the agent's own folder in the profile, made only the user's", async () => {
    const response = await ask({ workspace, agentId: "writer", harness: "claude-code" });
    expect(response.status).toBe(200);
    const { settingsFolder } = (await response.json()) as { settingsFolder: string };
    expect(settingsFolder.startsWith(join(root, "data", "workspaces"))).toBe(true);
    expect(settingsFolder.endsWith(join("harness-settings", "writer", "claude-code"))).toBe(true);
    const folder = await stat(settingsFolder);
    expect(folder.isDirectory()).toBe(true);
    // On Windows the mode means nothing; the profile folder's own permissions protect it.
    if (process.platform !== "win32") expect(folder.mode & 0o077).toBe(0);
  });

  it("answers 404 for a folder the launcher did not name, and makes nothing for it", async () => {
    const other = join(root, "other");
    await mkdir(other);
    const response = await ask({ workspace: other, agentId: "writer", harness: "claude-code" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { kind: "unknown_workspace" } });
    expect(await exists(join(root, "data"))).toBe(false);
  });

  it("answers 404 for a harness the host does not have", async () => {
    const response = await ask({ workspace, agentId: "writer", harness: "halonic" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { kind: "unknown_harness" } });
  });

  it("answers 422 for an agent id that can't name a folder", async () => {
    const response = await ask({ workspace, agentId: "../writer", harness: "claude-code" });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { kind: "agent_id_refused" } });
  });

  it("answers 422 for a harness without a sign-in of its own", async () => {
    const response = await ask({ workspace, agentId: "writer", harness: "codex" });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { kind: "no_sign_in" } });
  });
});
