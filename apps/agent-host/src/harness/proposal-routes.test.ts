import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfilePlatform } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { webCryptoDigest } from "./host-profiles.ts";
import { HostProposalFolders } from "./host-proposals.ts";
import { proposalRoutes } from "./proposal-routes.ts";

const token = randomLaunchToken();
const profilePlatform = profilePlatformOf(process.platform);

function profilePlatformOf(platform: NodeJS.Platform): ProfilePlatform {
  if (platform === "win32") return "windows";
  return platform === "darwin" ? "macos" : "linux";
}
const run = {
  runId: "run_1",
  hubId: "hub_1",
  workflowId: "ship",
  version: { reads: "saved-files" },
};

let root: string;
let workspace: string;
let server: HostServer | undefined;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-proposal-route-")));
  workspace = join(root, "acme");
  await mkdir(workspace);
  await writeFile(join(workspace, "notes.md"), "hello");
  const proposals = new HostProposalFolders({
    profile: { platform: profilePlatform, root: join(root, "data") },
    workspaceRoots: [workspace],
    digest: webCryptoDigest,
    onEndFailed: () => {},
  });
  server = await startHostServer(token, proposalRoutes(proposals));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(root, { recursive: true, force: true });
});

async function ask(route: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server?.url}/v1/proposals/${route}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

verifies("agent-host.proposal-routes", () => {
  it("opens a copy of the saved files in Halonic's data folder, finds it and ends it", async () => {
    const opened = await ask("open", { workspace, run });
    expect(opened.status).toBe(200);
    const { folder } = opened.body as { folder: string };
    expect(folder.startsWith(join(root, "data"))).toBe(true);
    expect(await readFile(join(folder, "notes.md"), "utf8")).toBe("hello");
    expect((await ask("folder-of", { workspace, runId: "run_1" })).body).toEqual({ folder });
    expect((await ask("end", { workspace, runId: "run_1" })).status).toBe(200);
    expect(
      await stat(folder).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect((await ask("folder-of", { workspace, runId: "run_1" })).body).toEqual({ folder: null });
  });

  it("answers 404 for a workspace the launcher did not name, and makes nothing for it", async () => {
    const other = join(root, "other");
    await mkdir(other);
    for (const [route, body] of [
      ["open", { workspace: other, run }],
      ["folder-of", { workspace: other, runId: "run_1" }],
      ["end", { workspace: other, runId: "run_1" }],
      ["start", { workspace: other, openRuns: [] }],
    ] as const) {
      expect((await ask(route, body)).status).toBe(404);
    }
    expect(
      await stat(join(root, "data")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  });

  it("starts without git when nothing was kept, so a workspace that never ran an agent needs none", async () => {
    expect(await ask("start", { workspace, openRuns: [] })).toEqual({ status: 200, body: {} });
  });

  it("refuses a body with a field it does not know", async () => {
    expect((await ask("open", { workspace, run, folder: root })).status).toBe(400);
  });
});
