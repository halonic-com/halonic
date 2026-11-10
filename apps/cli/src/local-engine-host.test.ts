import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { RunHistory, WorkflowRuns } from "@halonicjs/app";
import type { HttpClient, Secrets } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalEngine, openLocalEngine, runDefinitionsOf } from "./local-engine-host.ts";
import { nodeProfileEnvironment, openWorkspaceRuns } from "./workspace-runs.ts";

/** The Acme example, on the test model: Support reply takes Sam's email down the refund path. */
const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));

const secrets: Secrets = { get: async () => null };
const http: HttpClient = {
  fetch: async () => {
    throw new TypeError("The test model calls no server.");
  },
};

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let workspace: LoadedWorkspace;
let schedulerErrors: unknown[];
const opened: LocalEngine[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-local-engine-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "profile") } };
  workspace = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
  schedulerErrors = [];
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((engine) => engine.close()));
  await rm(folder, { recursive: true, force: true });
});

async function openEngine(): Promise<LocalEngine> {
  const engine = await openLocalEngine({
    workspace,
    workspaceRoot: acme,
    secrets,
    http,
    environment: profile,
    reportError: (error) => schedulerErrors.push(error),
  });
  opened.push(engine);
  return engine;
}

async function samsEmail(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(acme, "examples/refund-question.json"), "utf8"));
}

verifies("cli.local-engine", () => {
  it("runs Support reply on the test model until it waits for the reply's approval", async () => {
    const engine = await openEngine();

    const started = await new WorkflowRuns(engine.executor).startRun(
      workspace,
      "support-reply",
      await samsEmail(),
    );

    expect(started.found).toBe("one");
    if (started.found !== "one") return;
    expect(started.run.summary).toMatchObject({
      hubId: "support",
      workflowId: "support-reply",
      status: "waiting",
      state: "review",
      accepts: ["approve", "reject"],
    });
    expect(schedulerErrors).toEqual([]);
  });

  it("keeps the run in the workspace's run store in the profile, where `halonic runs` reads it", async () => {
    const engine = await openEngine();
    const started = await new WorkflowRuns(engine.executor).startRun(
      workspace,
      "support-reply",
      await samsEmail(),
    );
    if (started.found !== "one") throw new Error("Support reply didn't start.");

    const history = new RunHistory(await openWorkspaceRuns(acme, profile));
    const listed = await history.listRuns({});

    expect(listed.runs.map((run) => run.id)).toEqual([started.run.summary.id]);
  });

  it("finishes a waiting run in the next engine on the same workspace", async () => {
    const first = await openEngine();
    const started = await new WorkflowRuns(first.executor).startRun(
      workspace,
      "support-reply",
      await samsEmail(),
    );
    if (started.found !== "one") throw new Error("Support reply didn't start.");
    await first.close();
    opened.splice(opened.indexOf(first), 1);

    const second = await openEngine();
    const { summary } = started.run;
    await second.executor.send(summary.id, "approve");
    const finished = await new WorkflowRuns(second.executor).follow(summary.id, {
      after: summary.lastSeq,
    });

    expect(finished.summary).toMatchObject({ status: "completed", state: "replied" });
    expect(schedulerErrors).toEqual([]);
  });

  it("starts a run with the hub's workflow, agents, workflows and collections", () => {
    const definitions = runDefinitionsOf(workspace, "support", "support-reply");

    expect(definitions.workflow.id).toBe("support-reply");
    expect(Object.keys(definitions.agents ?? {}).sort()).toEqual(["sorter", "writer"]);
    expect(Object.keys(definitions.workflows ?? {})).toEqual(["support-reply"]);
    expect(definitions.collections).toEqual({});
  });

  it("refuses a workflow the hub doesn't have, naming the hub and the workflow", () => {
    expect(() => runDefinitionsOf(workspace, "support", "weekly-report")).toThrow(
      new RangeError('The hub "support" has no workflow "weekly-report".'),
    );
  });
});

describe("openLocalEngine", () => {
  it("refuses a workspace folder that doesn't exist", async () => {
    await expect(
      openLocalEngine({
        workspace,
        workspaceRoot: join(folder, "gone"),
        secrets,
        http,
        environment: profile,
        reportError: () => {},
      }),
    ).rejects.toThrow(/ENOENT/);
  });
});
