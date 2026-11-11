import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore, heldLockRenewEveryMs } from "@halonicjs/adapter-fs-node";
import { RunHistory, WorkflowRuns } from "@halonicjs/app";
import {
  type ConnectorClient,
  type HttpClient,
  runLockFormat,
  type Secrets,
} from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engineLockFile, type LocalEngine, openLocalEngine } from "./local-engine-host.ts";
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

  // Run logs hold prompts, tool results and model output (HAL-5215).
  it("keeps the workspace's folder in the profile, its run files and the engine lock private to the user", async () => {
    // Windows has no file modes: Node reports `666` there for any folder or file that isn't read-only.
    const [folderMode, fileMode] = process.platform === "win32" ? [0o666, 0o666] : [0o700, 0o600];
    const engine = await openEngine();
    await new WorkflowRuns(engine.executor).startRun(workspace, "support-reply", await samsEmail());

    const lock = await acmeEngineLock();
    const workspaceFolder = join(lock, "..");
    const runs = join(workspaceFolder, "runs");
    expect((await stat(workspaceFolder)).mode & 0o777).toBe(folderMode);
    expect((await stat(runs)).mode & 0o777).toBe(folderMode);
    expect((await stat(lock)).mode & 0o777).toBe(fileMode);
    const files = await readdir(runs);
    expect(files.some((name) => name.endsWith(".jsonl"))).toBe(true);
    for (const name of files) {
      expect([name, (await stat(join(runs, name))).mode & 0o777]).toEqual([name, fileMode]);
    }
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
  it("opens anyway when a leftover program copy can't be swept, and empties the copies folder", async () => {
    // Acme here has no history, so git can't sweep the copy a stopped engine left.
    const first = await openEngine();
    await first.close();
    const workspaces = join(profileFolder(profile).root, "workspaces");
    const [key] = await readdir(workspaces);
    const copies = join(workspaces, key ?? "", "program-copies");
    await mkdir(join(copies, "leftover"));
    await writeFile(join(copies, "leftover", "server.js"), "old");
    const reported: unknown[] = [];

    const engine = await openLocalEngine({
      workspace,
      workspaceRoot: acme,
      secrets,
      http,
      environment: profile,
      reportError: (_error, source) => reported.push(source),
    });
    opened.push(engine);

    expect(await readdir(copies)).toEqual([]);
    expect(reported).toEqual(["program-copies"]);
  });
});

// The attack tests of HAL-4045 for the engine lock.
describe("the engine lock under attack", () => {
  // Runs before the file's afterEach closes the engines, and even when a test fails.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses a second engine that opens the workspace through a symlink", async () => {
    await openEngine();
    const linked = join(folder, "acme-link");
    await symlink(acme, linked, "dir");

    const second = openLocalEngine({
      workspace,
      workspaceRoot: linked,
      secrets,
      http,
      environment: profile,
      reportError: () => {},
    });

    await expect(second).rejects.toMatchObject({ kind: "conflict" });
  });

  it("reports a lock another process took over, and closes without removing that lock", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const reported: [unknown, unknown][] = [];
    const engine = await openLocalEngine({
      workspace,
      workspaceRoot: acme,
      secrets,
      http,
      environment: profile,
      reportError: (error, source) => reported.push([error, source]),
    });
    const taker = JSON.stringify({
      version: runLockFormat,
      pid: process.pid,
      host: "another-computer",
      takenAt: new Date().toISOString(),
    });
    const lock = await acmeEngineLock();
    await writeFile(lock, taker, "utf8");

    await vi.advanceTimersByTimeAsync(heldLockRenewEveryMs);
    await engine.close();

    expect(reported).toEqual([
      [new Error(`The lock ${lock} was taken over by another process.`), "engine-lock"],
    ]);
    expect(await readFile(lock, "utf8")).toBe(taker);
  });

  describe("a chat turn", () => {
    /** A mail connector whose file puts `lookup` under `approve`, and an agent that lists it. */
    async function mailWorkspace(): Promise<void> {
      await mkdir(join(acme, "library/connectors"), { recursive: true });
      await writeFile(
        join(acme, "library/connectors/mail.connector.yaml"),
        [
          "id: mail",
          "name: Mail",
          "transport:",
          "  http:",
          "    url: https://mail.example.com/mcp",
          "tools:",
          "  allow: [lookup]",
          "  approve: [lookup]",
          "",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        join(acme, "hubs/support/agents/clerk.agent.yaml"),
        "id: clerk\nname: Clerk\nconnectors: [mail]\ninstructions: Look things up.\n",
        "utf8",
      );
      await writeFile(
        join(acme, "providers/mock.yaml"),
        'id: mock\nname: Test model\ntype: mock\nlocal: true\noptions:\n  script:\n    clerk: ["tool:lookup {}", "Done"]\n',
        "utf8",
      );
      workspace = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
    }

    it("refuses a read tool that its connector file puts under approve", async () => {
      await mailWorkspace();
      const calls: string[] = [];
      const mail: ConnectorClient = {
        id: "mail",
        listTools: async () => [
          {
            name: "lookup",
            description: "Looks a message up",
            risk: "read",
            parameters: { type: "object", properties: {} },
          },
        ],
        callTool: async (name) => {
          calls.push(name);
          return "found";
        },
        close: async () => {},
      };
      const engine = await openLocalEngine({
        workspace,
        workspaceRoot: acme,
        secrets,
        http,
        environment: profile,
        connectors: [mail],
        reportError: (error) => schedulerErrors.push(error),
      });
      opened.push(engine);

      const response = await engine.executor.chatTurn({
        hubId: "support",
        agentId: "clerk",
        messages: [{ role: "user", content: "Find the refund mail." }],
        tools: [],
      });

      expect(calls).toEqual([]);
      expect(response.refusals).toEqual([
        expect.objectContaining({ source: "mail", name: "lookup", refused: "call" }),
      ]);
    });
  });
});
