import { cp, mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { WorkflowRuns } from "@halonicjs/app";
import type { HarnessRunsOptions, RunProposalFolders } from "@halonicjs/engine";
import { type HttpClient, noKeyOrigins, type Secrets } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EngineLockHeldError } from "./engine-lock-held.ts";
import type { EnginePlace } from "./engine-state-folders.ts";
import {
  type EngineHarnessHost,
  type LocalEngine,
  type OpenLocalEngineInput,
  openLocalEngine,
} from "./local-engine.ts";
import { removeTestFolder } from "./test/remove-folder.ts";

/** The Acme example, on the test model: Support reply takes Sam's email down the refund path. */
const acmeExample = fileURLToPath(new URL("../../../../examples/acme", import.meta.url));

const secrets: Secrets = { get: async () => null };
const http: HttpClient = {
  fetch: async () => {
    throw new TypeError("The test model calls no server.");
  },
};

let folder: string;
let acme: string;
let environment: ProfileEnvironment;
let workspace: LoadedWorkspace;
let reported: unknown[];
/** What the harness host was asked, in order, across every engine of a test. */
let harnessCalls: string[];
const opened: LocalEngine[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-engine-local-engine-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  environment = {
    platform: thisPlatform(),
    homeFolder: join(folder, "home"),
    variables: { HALONIC_HOME: join(folder, "profile") },
  };
  workspace = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
  reported = [];
  harnessCalls = [];
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((engine) => engine.close()));
  await removeTestFolder(folder);
});

/** The profile's name for this computer's system. */
function thisPlatform(): ProfileEnvironment["platform"] {
  if (process.platform === "win32") {
    return "windows";
  }
  return process.platform === "darwin" ? "macos" : "linux";
}

/**
 * A harness host that records what the engine asks of it. Support reply
 * runs no harness agent, so its harnesses and proposal folders are never used.
 */
function recordingHarnessHost(
  failing: { readonly start?: Error } = {},
): OpenLocalEngineInput["openHarnessHost"] {
  return async (place: EnginePlace): Promise<EngineHarnessHost> => {
    harnessCalls.push(`open ${place.location}`);
    return {
      harnesses: {} as unknown as HarnessRunsOptions,
      proposalFolders: {} as unknown as RunProposalFolders,
      start: async () => {
        harnessCalls.push("start");
        if (failing.start !== undefined) throw failing.start;
      },
      close: async () => void harnessCalls.push("close"),
    };
  };
}

async function openEngine(overrides: Partial<OpenLocalEngineInput> = {}): Promise<LocalEngine> {
  const engine = await openLocalEngine({
    workspace,
    workspaceRoot: acme,
    environment,
    secrets,
    keyOrigins: noKeyOrigins,
    http,
    trusted: true,
    openHarnessHost: recordingHarnessHost(),
    listedToolApproval: () => ({ kind: "none" }),
    reportError: (error) => reported.push(error),
    ...overrides,
  });
  opened.push(engine);
  return engine;
}

async function samsEmail(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(acme, "examples/refund-question.json"), "utf8"));
}

verifies("cli.local-engine", () => {
  it("runs Support reply on the test model with the harness host its caller gives", async () => {
    const engine = await openEngine();

    const started = await new WorkflowRuns(engine.executor).startRun(
      workspace,
      "support-reply",
      await samsEmail(),
    );

    expect(started.found === "one" && started.run.summary).toMatchObject({
      workflowId: "support-reply",
      status: "waiting",
    });
    expect(harnessCalls).toEqual([`open ${await realpath(acme)}`, "start"]);
    expect(reported).toEqual([]);
  });

  it("closes the harness host when the engine closes", async () => {
    const engine = await openEngine();

    await engine.close();
    await engine.close();

    expect(harnessCalls.slice(1)).toEqual(["start", "close"]);
  });
});

verifies("workspace-engine-node.engine-state-folders", () => {
  it("refuses a second engine with EngineLockHeldError, naming the first engine's process", async () => {
    await openEngine();

    const opening = openEngine();

    await expect(opening).rejects.toBeInstanceOf(EngineLockHeldError);
    await expect(opening).rejects.toMatchObject({ holder: { pid: process.pid } });
  });
});

verifies("cli.local-engine-lock", () => {
  it("refuses a second engine on the workspace with the engine's own lock error", async () => {
    await openEngine();

    await expect(openEngine()).rejects.toBeInstanceOf(EngineLockHeldError);
  });

  it("names its holder in the lock with the words its caller gives", async () => {
    await openEngine({ holder: "halonic run" });

    await expect(openEngine()).rejects.toMatchObject({
      holder: { pid: process.pid, holder: "halonic run" },
    });
  });

  it("releases the lock and closes the harness host when the harness host can't start", async () => {
    const opening = openEngine({
      openHarnessHost: recordingHarnessHost({ start: new Error("The proposals folder is gone.") }),
    });

    await expect(opening).rejects.toThrow("The proposals folder is gone.");
    expect(harnessCalls.slice(1)).toEqual(["start", "close"]);
    await expect(openEngine()).resolves.toBeDefined();
  });

  it("releases the lock when the harness host can't be opened", async () => {
    const opening = openEngine({
      openHarnessHost: async () => {
        throw new Error("No harness host here.");
      },
    });

    await expect(opening).rejects.toThrow("No harness host here.");
    await expect(openEngine()).resolves.toBeDefined();
  });
});
