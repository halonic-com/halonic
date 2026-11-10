import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { CommandContext } from "./command.ts";
import { runMessages } from "./messages/run.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import { openWorkspaceEngine, type WorkspaceEngineSetup } from "./workspace-engine.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-workspace-engine-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function setup(): WorkspaceEngineSetup {
  return {
    http: { fetch: () => Promise.reject(new TypeError("no server")) },
    profile: { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "home") } },
    sandboxGate: () => ({
      sandbox: { check: () => Promise.reject(new Error("Acme's agents need no sandbox.")) },
      placement: { where: () => Promise.reject(new Error("Acme's agents need no placement.")) },
    }),
  };
}

const context = (signal: AbortSignal): CommandContext =>
  ({
    cwd: acme,
    secrets: { get: async () => null },
    signal,
    debug: () => {},
  }) as unknown as CommandContext;

async function open(signal: AbortSignal) {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const workspace = await loadWorkspace(dir.store);
  return openWorkspaceEngine(context(signal), setup(), {
    dir,
    workspace,
    run: { hubId: "support", workflowId: "support-reply", ending: runMessages.nothingRan() },
  });
}

verifies("cli.run", () => {
  it("aborts the engine's signal at Ctrl C, and not its stuck signal", async () => {
    const ctrlC = new AbortController();
    const engine = await open(ctrlC.signal);

    ctrlC.abort();
    await engine.close();

    expect([engine.signal.aborted, engine.stuck.aborted]).toEqual([true, false]);
  });

  it("leaves the signal alone until Ctrl C", async () => {
    const engine = await open(new AbortController().signal);
    await engine.close();

    expect(engine.signal.aborted).toBe(false);
  });
});
