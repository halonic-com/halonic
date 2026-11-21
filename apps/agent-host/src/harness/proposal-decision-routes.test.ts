import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfilePlatform } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { webCryptoDigest } from "./host-profiles.ts";
import { HostProposalFolders } from "./host-proposals.ts";
import { proposalDecisionRoutes } from "./proposal-decision-routes.ts";
import { ProposalUndoSteps } from "./proposal-undo-steps.ts";

const token = randomLaunchToken();

function profilePlatformOf(platform: NodeJS.Platform): ProfilePlatform {
  if (platform === "win32") return "windows";
  return platform === "darwin" ? "macos" : "linux";
}

let root: string;
let workspace: string;
let other: string;
let server: HostServer | undefined;
let proposals: HostProposalFolders;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-proposal-decisions-")));
  workspace = join(root, "acme");
  other = join(root, "globex");
  for (const folder of [workspace, other]) {
    await mkdir(folder);
    await writeFile(join(folder, "notes.md"), "hello");
  }
  proposals = new HostProposalFolders({
    profile: { platform: profilePlatformOf(process.platform), root: join(root, "data") },
    workspaceRoots: [workspace, other],
    digest: webCryptoDigest,
    onEndFailed: () => {},
  });
  let next = 0;
  const steps = new ProposalUndoSteps(() => `undo_${++next}`);
  server = await startHostServer(token, proposalDecisionRoutes(proposals, steps));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await proposals.close();
  await rm(root, { recursive: true, force: true });
});

/** A run in the workspace that changed `notes.md`, ended with its proposal. */
async function proposeChange(runId = "run_1"): Promise<void> {
  const run = {
    runId,
    hubId: "hub_1",
    workflowId: "ship",
    version: { reads: "saved-files" },
  } as const;
  const folder = await proposals.open(workspace, run);
  if (folder === undefined) throw new Error("The test workspace isn't named.");
  await writeFile(join(folder, "notes.md"), "hello from the run");
  await proposals.end(workspace, runId);
}

async function ask(route: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server?.url}/v1/proposals/${route}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const notes = () => readFile(join(workspace, "notes.md"), "utf8");

verifies("agent-host.proposal-decision-routes", () => {
  it("lists the open proposal with its file undecided", async () => {
    await proposeChange();
    const listed = await ask("list", { workspace });
    expect(listed.status).toBe(200);
    const [record] = (listed.body as { proposals: Record<string, unknown>[] }).proposals;
    expect(record).toMatchObject({
      state: "proposed",
      proposal: { runId: "run_1", files: [{ path: "notes.md", change: "modified" }] },
      decisions: { "notes.md": "undecided" },
    });
  });

  it("accepts the file, and the answer's undo id puts it back", async () => {
    await proposeChange();
    const accepted = await ask("accept", { workspace, runId: "run_1", target: "all" });
    expect(accepted).toEqual({
      status: 200,
      body: { undo: "undo_1", written: ["notes.md"], changedOnDisk: [], refused: [] },
    });
    expect(await notes()).toBe("hello from the run");
    const undone = await ask("restore", { workspace, undo: "undo_1", to: "before" });
    expect(undone).toEqual({ status: 200, body: { changedOnDisk: [], refused: [] } });
    expect(await notes()).toBe("hello");
  });

  it("rejects and settles, dropping the reject's undo step", async () => {
    await proposeChange();
    const rejected = await ask("reject", {
      workspace,
      runId: "run_1",
      target: { file: "notes.md" },
    });
    expect(rejected).toEqual({ status: 200, body: { undo: "undo_1" } });
    expect(await ask("settle", { workspace, runId: "run_1" })).toEqual({
      status: 200,
      body: { result: "settled" },
    });
    expect(await notes()).toBe("hello");
    expect((await ask("list", { workspace })).body).toEqual({ proposals: [] });
    expect((await ask("restore", { workspace, undo: "undo_1", to: "before" })).status).toBe(404);
  });

  it("restores a step only for the workspace that made it", async () => {
    await proposeChange();
    await ask("accept", { workspace, runId: "run_1", target: "all" });
    const elsewhere = await ask("restore", { workspace: other, undo: "undo_1", to: "before" });
    expect(elsewhere.status).toBe(404);
    expect((elsewhere.body as { error: { kind: string } }).error.kind).toBe("unknown_undo");
    expect(await notes()).toBe("hello from the run");
  });

  it("answers 404 for a run with no proposal and for a workspace the launcher did not name", async () => {
    const noProposal = await ask("accept", { workspace, runId: "run_9", target: "all" });
    expect(noProposal.status).toBe(404);
    expect((noProposal.body as { error: { kind: string } }).error.kind).toBe("unknown_proposal");
    const unnamed = join(root, "initech");
    await mkdir(unnamed);
    for (const [route, body] of [
      ["list", { workspace: unnamed }],
      ["accept", { workspace: unnamed, runId: "run_1", target: "all" }],
      ["reject", { workspace: unnamed, runId: "run_1", target: "all" }],
      ["restore", { workspace: unnamed, undo: "undo_1", to: "before" }],
      ["settle", { workspace: unnamed, runId: "run_1" }],
    ] as const) {
      expect((await ask(route, body)).status).toBe(404);
    }
    expect(await notes()).toBe("hello");
  });

  it("refuses an undo step's texts in the body: only the host's id restores", async () => {
    await proposeChange();
    const step = {
      source: { kind: "edit" },
      files: [{ path: "notes.md", before: "x", after: "hello" }],
    };
    expect((await ask("restore", { workspace, undo: "undo_1", to: "before", step })).status).toBe(
      400,
    );
    expect(await notes()).toBe("hello");
  });
});
