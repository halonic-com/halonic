import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { RunHistory, WorkflowRuns } from "@halonicjs/app";
import { type HttpClient, runLockFormat, type Secrets } from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  engineLockFile,
  type LocalEngine,
  openLocalEngine,
  runDefinitionsOf,
} from "./local-engine-host.ts";
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

/** The engine lock of the Acme workspace, in its only folder in the profile. */
async function acmeEngineLock(): Promise<string> {
  const workspaces = join(profileFolder(profile).root, "workspaces");
  const [key] = await readdir(workspaces);
  return join(workspaces, key ?? "", engineLockFile);
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

verifies("cli.local-engine-lock", () => {
  it("refuses a second engine on the workspace while the first is open", async () => {
    await openEngine();

    const second = openEngine();

    await expect(second).rejects.toBeInstanceOf(KindedError);
    await expect(second).rejects.toMatchObject({
      kind: "conflict",
      message: `Another Halonic engine is open on this workspace (process ${process.pid}).`,
      fix: "Wait until it has finished or stop it, then run again.",
    });
  });

  it("opens the next engine once the first is closed, and closes twice safely", async () => {
    const first = await openEngine();
    await first.close();
    await first.close();

    await expect(openEngine()).resolves.toBeDefined();
  });

  it("takes over the lock an engine left when its process ended", async () => {
    await (await openEngine()).close();
    const exited = spawnSync(process.execPath, ["--eval", ""]).pid;
    const left = {
      version: runLockFormat,
      pid: exited,
      host: hostname(),
      takenAt: new Date().toISOString(),
    };
    await writeFile(await acmeEngineLock(), JSON.stringify(left), "utf8");

    await openEngine();

    expect(JSON.parse(await readFile(await acmeEngineLock(), "utf8")).pid).toBe(process.pid);
  });

  it("with two engines on the Acme example, runs each step of Support reply once", async () => {
    const engine = await openEngine();
    const started = await new WorkflowRuns(engine.executor).startRun(
      workspace,
      "support-reply",
      await samsEmail(),
    );
    if (started.found !== "one") throw new Error("Support reply didn't start.");
    await expect(openEngine()).rejects.toMatchObject({ kind: "conflict" });

    const { summary } = started.run;
    await engine.executor.send(summary.id, "approve");
    await new WorkflowRuns(engine.executor).follow(summary.id, { after: summary.lastSeq });

    const entered = (await engine.runs.events(summary.id)).flatMap((event) =>
      event.type === "state.entered" ? [event.state] : [],
    );
    expect(entered).toEqual([...new Set(entered)]);
    expect(entered).toContain("replied");
    expect(schedulerErrors).toEqual([]);
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
