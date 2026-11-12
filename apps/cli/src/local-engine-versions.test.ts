import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { RunHistory } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import type { HttpClient, Secrets } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace, runDefinitionsOf } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type LocalEngine, openLocalEngine, type WorkspaceVersions } from "./local-engine-host.ts";
import { nodeProfileEnvironment, openWorkspaceRuns } from "./workspace-runs.ts";

/** The Acme example, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));

const secrets: Secrets = { get: async () => null };
const http: HttpClient = {
  fetch: async () => {
    throw new TypeError("The test model calls no server.");
  },
};

/** The live version Support reply's run records, as `routines watch` gives it. */
const liveVersion: RunVersion = {
  reads: "live-version",
  commit: "4f2a9c1e0b7d3a5f8e6c2b1a0d9f8e7c6b5a4f3e",
  versionDate: "2026-11-10T09:42:00+01:00",
};

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let workspace: LoadedWorkspace;
const opened: LocalEngine[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-engine-versions-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "profile") } };
  workspace = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((engine) => engine.close()));
  await rm(folder, { recursive: true, force: true });
});

async function openEngine(versions: WorkspaceVersions): Promise<LocalEngine> {
  const engine = await openLocalEngine({
    workspace,
    versions,
    workspaceRoot: acme,
    secrets,
    http,
    environment: profile,
    reportError: (error) => {
      throw error;
    },
  });
  opened.push(engine);
  return engine;
}

/** Starts Support reply on the engine with Sam's email, recording `version`. */
async function startReply(engine: LocalEngine, version: RunVersion) {
  const input = JSON.parse(await readFile(join(acme, "examples/refund-question.json"), "utf8"));
  return await engine.executor.start({
    hubId: "support",
    workflowId: "support-reply",
    input,
    version,
  });
}

verifies("cli.local-engine", () => {
  it("starts a run with the definitions of the version it records", async () => {
    const asked: (RunVersion | undefined)[] = [];
    const engine = await openEngine({
      latest: () => workspace,
      definitionsOf: async (hubId, workflowId, version) => {
        asked.push(version);
        return runDefinitionsOf(workspace, hubId, workflowId);
      },
    });

    const started = await startReply(engine, liveVersion);

    expect(asked).toEqual([liveVersion]);
    expect(started).toMatchObject({ workflowId: "support-reply" });
  });

  it("starts no run when its version can't give the definitions", async () => {
    const engine = await openEngine({
      latest: () => workspace,
      definitionsOf: async () => {
        throw new Error("Acme changed since it was trusted.");
      },
    });

    await expect(startReply(engine, liveVersion)).rejects.toThrow(
      "Acme changed since it was trusted.",
    );
    const history = new RunHistory(await openWorkspaceRuns(acme, profile));
    expect((await history.listRuns({})).runs).toEqual([]);
  });

  it("takes a chat turn's agent and model from the version read last", async () => {
    const started = workspace;
    await writeFile(
      join(acme, "hubs/support/agents/greeter.agent.yaml"),
      "id: greeter\nname: Greeter\ninstructions: Say hello.\n",
      "utf8",
    );
    await writeFile(
      join(acme, "providers/mock.yaml"),
      'id: mock\nname: Test model\ntype: mock\nlocal: true\noptions:\n  script:\n    greeter: ["Hello from the new version"]\n',
      "utf8",
    );
    const newer = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
    let latest = started;
    const engine = await openEngine({
      latest: () => latest,
      definitionsOf: async (hubId, workflowId) => runDefinitionsOf(latest, hubId, workflowId),
    });
    latest = newer;

    const response = await engine.executor.chatTurn({
      hubId: "support",
      agentId: "greeter",
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
    });

    expect(response.content).toBe("Hello from the new version");
  });
});
