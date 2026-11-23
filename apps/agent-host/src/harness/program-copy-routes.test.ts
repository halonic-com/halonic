import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { plainEnvironment, testGit } from "@halonicjs/adapter-git/testing";
import { type ProfilePlatform, workspaceFolders } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { webCryptoDigest } from "./host-profiles.ts";
import { HostProgramCopies } from "./host-program-copies.ts";
import { programCopyRoutes } from "./program-copy-routes.ts";

/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;
const token = randomLaunchToken();

let root: string;
let workspace: string;
let commit: string;
let server: HostServer | undefined;
let copies: HostProgramCopies;
/** What happened, in order: connectors stopped, and whether a copy was still there then. */
let events: string[];

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-program-copy-route-")));
  workspace = join(root, "acme");
  await mkdir(workspace);
  const runner = await GitRunner.create({ git: await testGit() });
  try {
    const vcs = new GitVcs(workspace, {
      runner,
      author: { name: "Test", email: "test@example.com" },
    });
    await vcs.init();
    await writeFile(join(workspace, "server.js"), "live");
    await vcs.stage(["server.js"]);
    commit = await vcs.commit("First version");
  } finally {
    await runner.close();
  }
  // Saved after the version: neither may reach a copy.
  await writeFile(join(workspace, "server.js"), "saved");
  await writeFile(join(workspace, ".env"), "TOKEN=not-for-programs");
  events = [];
  copies = await hostCopies();
  server = await startHostServer(token, programCopyRoutes(copies));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await copies.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

const profile = () => ({ platform: profilePlatformOf(process.platform), root: join(root, "data") });

function profilePlatformOf(platform: NodeJS.Platform): ProfilePlatform {
  if (platform === "win32") return "windows";
  return platform === "darwin" ? "macos" : "linux";
}

async function hostCopies(): Promise<HostProgramCopies> {
  return new HostProgramCopies({
    profile: profile(),
    workspaceRoots: [workspace],
    digest: webCryptoDigest,
    git: { git: await testGit() },
    stopConnectors: async (stopped) => {
      events.push(`connectors of ${stopped} stopped, ${(await copiesLeft()).length} copies left`);
    },
    reportError: (error) => events.push(`reported ${String(error)}`),
  });
}

async function copiesLeft(): Promise<string[]> {
  const folders = await workspaceFolders(profile(), workspace, webCryptoDigest);
  return await readdir(folders.hostProgramCopiesFolder()).catch(() => []);
}

async function ask(
  route: string,
  body: unknown,
  headers: Record<string, string> = { authorization: `Bearer ${token}` },
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server?.url}/v1/program-copies/${route}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function openCopy(): Promise<string> {
  const opened = await ask("open", { workspace, commit });
  expect(opened.status).toBe(200);
  return (opened.body as { path: string }).path;
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(
    () => true,
    () => false,
  );
}

verifies("agent-host.program-copy-routes", () => {
  it(
    "opens a copy at the commit with the committed script, not the saved change, and no .env",
    async () => {
      const path = await openCopy();
      const folders = await workspaceFolders(profile(), workspace, webCryptoDigest);
      expect(path.startsWith(await realpath(folders.hostProgramCopiesFolder()))).toBe(true);
      expect(await readFile(join(path, "server.js"), "utf8")).toBe("live");
      expect(await readdir(path)).not.toContain(".env");
      expect(await copies.heldCopy(path)).toEqual({ copy: path, workspace });
    },
    gitTimeout,
  );

  it("answers 404 for a folder the launcher didn't name, and makes nothing", async () => {
    const other = join(root, "other");
    await mkdir(other);
    for (const [route, body] of [
      ["start", { workspace: other }],
      ["open", { workspace: other, commit }],
      ["release", { workspace: other, path: join(other, "copy") }],
    ] as const) {
      const answer = await ask(route, body);
      expect(answer.status).toBe(404);
      expect(answer.body).toMatchObject({ error: { kind: "unknown_workspace" } });
    }
    expect(await exists(join(root, "data"))).toBe(false);
    expect(events).toEqual([]);
  });

  it(
    "answers 422 for a commit it can't check out, never the saved folder",
    async () => {
      const answer = await ask("open", { workspace, commit: "0".repeat(40) });
      expect(answer.status).toBe(422);
      expect(answer.body).toMatchObject({ error: { kind: "program_copy_refused" } });
      expect(JSON.stringify(answer.body)).not.toContain(workspace);
    },
    gitTimeout,
  );

  it("answers 400 for a commit that isn't a full hex object id, such as a branch or an option", async () => {
    for (const given of [
      "main",
      "HEAD",
      "--upload-pack=touch",
      commit.slice(0, 12),
      "A".repeat(40),
    ]) {
      expect((await ask("open", { workspace, commit: given })).status).toBe(400);
    }
    expect((await ask("open", { workspace, commit, folder: root })).status).toBe(400);
  });

  it(
    "removes a released copy, and refuses a second release of it",
    async () => {
      const path = await openCopy();
      expect(await ask("release", { workspace, path })).toEqual({ status: 200, body: {} });
      expect(await exists(path)).toBe(false);
      expect(await copies.heldCopy(path)).toBeUndefined();
      expect((await ask("release", { workspace, path })).status).toBe(404);
    },
    gitTimeout,
  );

  it(
    "answers 404 for a path it doesn't hold for the workspace, and removes nothing",
    async () => {
      const path = await openCopy();
      for (const notHeld of [workspace, join(path, "..", "made-up"), join(root, "data")]) {
        const answer = await ask("release", { workspace, path: notHeld });
        expect(answer.status).toBe(404);
        expect(answer.body).toMatchObject({ error: { kind: "unknown_program_copy" } });
      }
      expect(await readFile(join(workspace, "server.js"), "utf8")).toBe("saved");
      expect(await readFile(join(path, "server.js"), "utf8")).toBe("live");
    },
    gitTimeout,
  );

  it(
    "stops the workspace's connectors before it sweeps its copies, and those a stopped host left",
    async () => {
      const left = await leaveCopyBehind();
      expect(await ask("start", { workspace })).toEqual({ status: 200, body: {} });
      expect(events).toEqual([`connectors of ${workspace} stopped, 1 copies left`]);
      expect(await copiesLeft()).toEqual([]);
      expect(await exists(left)).toBe(false);
    },
    gitTimeout,
  );

  it(
    "drops its own held copies on start, so a connector can't start in them any more",
    async () => {
      const path = await openCopy();
      expect(await ask("start", { workspace })).toEqual({ status: 200, body: {} });
      expect(events).toEqual([`connectors of ${workspace} stopped, 1 copies left`]);
      expect(await copies.heldCopy(path)).toBeUndefined();
      expect(await exists(path)).toBe(false);
    },
    gitTimeout,
  );

  it(
    "doesn't run a post-checkout hook of the workspace's repository when it makes a copy",
    async () => {
      const marker = join(root, "hook-ran");
      const hook = join(workspace, ".git", "hooks", "post-checkout");
      await mkdir(join(workspace, ".git", "hooks"), { recursive: true });
      await writeFile(hook, `#!/bin/sh\necho ran > '${marker}'\n`);
      await chmod(hook, 0o755);
      // Plain git runs it, so the hook itself works on this computer.
      await promisify(execFile)(
        await testGit(),
        ["-C", workspace, "worktree", "add", "--detach", join(root, "plain"), commit],
        { env: plainEnvironment() },
      );
      expect(await exists(join(root, "plain"))).toBe(true);
      expect(await readFile(marker, "utf8")).toBe("ran\n");
      await rm(marker);

      await openCopy();
      expect(await exists(marker)).toBe(false);
      expect(await readdir(root)).not.toContain("hook-ran");
    },
    gitTimeout,
  );

  it(
    "removes its copies when the host stops, twice safely, and opens none after",
    async () => {
      const path = await openCopy();
      await copies.close();
      await copies.close();
      expect(await exists(path)).toBe(false);
      expect((await ask("open", { workspace, commit })).status).toBe(422);
    },
    gitTimeout,
  );

  it("refuses every route without the launch token", async () => {
    for (const [route, body] of [
      ["start", { workspace }],
      ["open", { workspace, commit }],
      ["release", { workspace, path: workspace }],
    ] as const) {
      expect((await ask(route, body, {})).status).toBe(401);
      expect((await ask(route, body, { authorization: "Bearer wrong" })).status).toBe(401);
    }
    expect(await exists(join(root, "data"))).toBe(false);
    expect(events).toEqual([]);
  });
});

/** Makes a copy as a host would, which then stopped without removing it, and returns its folder. */
async function leaveCopyBehind(): Promise<string> {
  const folders = await workspaceFolders(profile(), workspace, webCryptoDigest);
  const runner = await GitRunner.create({ git: await testGit() });
  try {
    const author = { name: "Test", email: "test@example.com" };
    const stopped = new GitVcs(workspace, {
      runner,
      author,
      worktrees: folders.hostProgramCopiesFolder(),
    });
    return (await stopped.addWorktree(commit)).path;
  } finally {
    await runner.close();
  }
}
