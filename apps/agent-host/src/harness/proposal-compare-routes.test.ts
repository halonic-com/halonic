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
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-proposal-compare-")));
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

/** A run in the workspace that changed `notes.md` to `text`, ended with its proposal. */
async function proposeChange(runId = "run_1", text = "hello from the run"): Promise<void> {
  const run = {
    runId,
    hubId: "hub_1",
    workflowId: "ship",
    version: { reads: "saved-files" },
  } as const;
  const folder = await proposals.open(workspace, run);
  if (folder === undefined) throw new Error("The test workspace isn't named.");
  await writeFile(join(folder, "notes.md"), text);
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

/** The person's edit of `notes.md` after the run started. */
const edited = "hello\nfrom me";

/** Compare's answer for `notes.md`. */
async function compareNotes(): Promise<{ status: number; body: Record<string, unknown> }> {
  const answer = await ask("compare", { workspace, runId: "run_1", path: "notes.md" });
  return { status: answer.status, body: answer.body as Record<string, unknown> };
}

function kindOf(answer: { body: unknown }): string {
  return (answer.body as { error: { kind: string } }).error.kind;
}

verifies("agent-host.proposal-compare-routes", () => {
  it("answers the three texts for Compare, with the digest of the saved one as seen", async () => {
    await proposeChange();
    await writeFile(join(workspace, "notes.md"), edited);
    const compared = await compareNotes();
    expect(compared.status).toBe(200);
    expect(compared.body).toMatchObject({
      base: "hello",
      saved: edited,
      run: "hello from the run",
      combined: null,
    });
    expect(compared.body["seen"]).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("writes the run's text for use-run, and the answer's undo id puts the person's back", async () => {
    await proposeChange();
    await writeFile(join(workspace, "notes.md"), edited);
    const { seen } = (await compareNotes()).body;
    const chosen = await ask("choose", {
      workspace,
      runId: "run_1",
      path: "notes.md",
      choice: "use-run",
      seen,
    });
    expect(chosen).toEqual({
      status: 200,
      body: { undo: "undo_1", written: ["notes.md"], changedOnDisk: [], refused: [] },
    });
    expect(await notes()).toBe("hello from the run");
    await ask("restore", { workspace, undo: "undo_1", to: "before" });
    expect(await notes()).toBe(edited);
  });

  it("writes nothing over an edit made after Compare", async () => {
    await proposeChange();
    await writeFile(join(workspace, "notes.md"), edited);
    const { seen } = (await compareNotes()).body;
    await writeFile(join(workspace, "notes.md"), "later");
    const chosen = await ask("choose", {
      workspace,
      runId: "run_1",
      path: "notes.md",
      choice: "use-run",
      seen,
    });
    expect(chosen.body).toEqual({
      undo: null,
      written: [],
      changedOnDisk: ["notes.md"],
      refused: [],
    });
    expect(await notes()).toBe("later");
  });

  it("answers 409 cannot_combine when both changed the same line", async () => {
    await proposeChange();
    await writeFile(join(workspace, "notes.md"), edited);
    const { seen } = (await compareNotes()).body;
    const chosen = await ask("choose", {
      workspace,
      runId: "run_1",
      path: "notes.md",
      choice: "combine-both",
      seen,
    });
    expect(chosen.status).toBe(409);
    expect(kindOf(chosen)).toBe("cannot_combine");
    expect(await notes()).toBe(edited);
  });

  it("refuses to remove a proposal whose texts are still there", async () => {
    await proposeChange();
    const removed = await ask("remove", { workspace, runId: "run_1" });
    expect(removed.status).toBe(422);
    expect(kindOf(removed)).toBe("proposal_refused");
    expect((await ask("list", { workspace })).body).toMatchObject({ proposals: [{}] });
  });

  it("lists a settled proposal as done", async () => {
    await proposeChange();
    await ask("reject", { workspace, runId: "run_1", target: "all" });
    await ask("settle", { workspace, runId: "run_1" });
    const done = await ask("done", { workspace });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      proposals: [{ proposal: { runId: "run_1" }, decisions: { "notes.md": "rejected" } }],
    });
  });

  it("refuses a seen that isn't a digest, and a workspace the launcher did not name", async () => {
    await proposeChange();
    const choice = { runId: "run_1", path: "notes.md", choice: "use-run" };
    expect((await ask("choose", { workspace, ...choice, seen: "hello" })).status).toBe(400);
    const unnamed = join(root, "initech");
    await mkdir(unnamed);
    for (const [route, body] of [
      ["compare", { workspace: unnamed, runId: "run_1", path: "notes.md" }],
      ["choose", { workspace: unnamed, ...choice, seen: "absent" }],
      ["remove", { workspace: unnamed, runId: "run_1" }],
      ["done", { workspace: unnamed }],
    ] as const) {
      expect((await ask(route, body)).status).toBe(404);
    }
    expect(await notes()).toBe("hello");
  });
});
