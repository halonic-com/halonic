import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { ConnectorFactories, WorkflowRuns } from "@halonicjs/app";
import type { ConnectorFactory, TrustGrant } from "@halonicjs/ports";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { CommandContext } from "./command.ts";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { stuckTimerWatch } from "./stuck-timers.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import {
  engineErrorReporter,
  openWorkspaceEngine,
  type WorkspaceEngineSetup,
} from "./workspace-engine.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

// The runs' connectors of the CLI's engine (HAL-6277): the grant they start
// with, and clean-up that never stops the command. The engine's signals and
// stuck runs are in `workspace-engine.test.ts`.

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-engine-connectors-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await removeTestFolder(folder);
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

verifies("cli.local-engine", () => {
  it.each([
    ["a trusted workspace's grant", contractGrant],
    ["no grant, for a run that reaches only the test model", null],
  ])("starts the runs' connectors with %s", async (_case, trust) => {
    const given: (TrustGrant | null)[] = [];
    const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
    const workspace = await loadWorkspace(dir.store);
    const engine = await openWorkspaceEngine(
      context(new AbortController().signal),
      {
        ...setup(),
        runConnectors: (grant) => {
          given.push(grant);
          return {
            factories: new ConnectorFactories([]),
            context: { http: setup().http, tokens: new MemoryTokenStore() },
            trust: grant,
          };
        },
      },
      {
        dir,
        workspace,
        trust,
        runs: [{ hubId: "support", workflowId: "support-reply" }],
        ending: runMessages.nothingRan(),
      },
    );
    await engine.close();

    expect(given).toEqual([trust]);
  });

  it("only shows a failed clean-up with --debug, however often it fails", () => {
    const stuck = stuckTimerWatch();
    const debugLines: string[] = [];
    const reportError = engineErrorReporter(stuck, (line) => debugLines.push(plainText(line)));

    for (let failure = 0; failure < 4; failure += 1) {
      reportError(new Error("program still running"), "run-connectors");
      reportError(new Error("git is gone"), "program-copies");
    }

    expect(stuck.signal.aborted).toBe(false);
    expect(debugLines.slice(0, 2)).toEqual([
      "the engine couldn't close a run's connectors: program still running",
      "the engine couldn't sweep a leftover program copy: git is gone",
    ]);
    expect(debugLines).toHaveLength(8);
  });

  it("still counts a lost engine lock towards stopping the command", () => {
    const stuck = stuckTimerWatch();
    const reportError = engineErrorReporter(stuck, () => {});

    for (let failure = 0; failure < 3; failure += 1) {
      reportError(new Error("lock taken"), "engine-lock");
    }

    expect(stuck.signal.reason).toEqual(new Error("lock taken"));
  });

  it("gives a run's connector programs the grant, and goes on when three fail to close", async () => {
    const { trusts, debugLines, stuck } = await runReportWithNotes(contractGrant);

    expect(trusts).toEqual([contractGrant, contractGrant, contractGrant]);
    // As many failures as stop the command when a step fails them in a row.
    expect(stuck).toBe(false);
    expect(debugLines.filter((line) => line.includes("close a run's connectors")).sort()).toEqual(
      ["notes", "notes-2", "notes-3"].map(
        (id) => `the engine couldn't close a run's connectors: ${id} didn't stop`,
      ),
    );
  });
});

/** What the connectors of {@link runReportWithNotes}'s run started with, and how the command went. */
interface NotesRun {
  /** The trust grant each connector program was created with. */
  readonly trusts: readonly (TrustGrant | null)[];
  readonly debugLines: readonly string[];
  readonly stuck: boolean;
}

/**
 * Adds three connector files to the workspace, `notes` and two more, and
 * runs Weekly report on the saved files in an engine opened with `trust`,
 * its Reporter calling `notes`' tool once. The connectors are fakes that
 * remember the grant they were created with, and whose close fails.
 */
async function runReportWithNotes(trust: TrustGrant | null): Promise<NotesRun> {
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  for (const id of ["notes", "notes-2", "notes-3"]) {
    await writeFile(
      join(acme, "library", "connectors", `${id}.connector.yaml`),
      `id: ${id}\nname: ${id}\ntransport:\n  stdio:\n    command: node\ntools:\n  allow: [which]\n  read: [which]\n`,
    );
  }
  await writeFile(
    join(acme, "hubs", "reports", "agents", "reporter.agent.yaml"),
    "id: reporter\nname: Reporter\nconnectors: [notes]\ninstructions: Ask the notes.\n",
  );
  await writeFile(
    join(acme, "providers", "mock.yaml"),
    'id: mock\nname: Test model\ntype: mock\nlocal: true\noptions:\n  script:\n    reporter: ["tool:which {}", "Done"]\n',
  );
  const trusts: (TrustGrant | null)[] = [];
  const stdio: ConnectorFactory = {
    transport: "stdio",
    create: (config, factoryContext) => {
      trusts.push(factoryContext.trust);
      return {
        id: config.id,
        listTools: async () => [{ name: "which", description: "Says which.", parameters: {} }],
        callTool: async () => "the notes",
        close: async () => {
          throw new Error(`${config.id} didn't stop`);
        },
      };
    },
  };
  const debugLines: string[] = [];
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const workspace = await loadWorkspace(dir.store);
  const engine = await openWorkspaceEngine(
    { ...context(new AbortController().signal), debug: (line) => debugLines.push(plainText(line)) },
    {
      ...setup(),
      runConnectors: (grant) => ({
        factories: new ConnectorFactories([stdio]),
        context: { http: setup().http, tokens: new MemoryTokenStore() },
        trust: grant,
      }),
    },
    {
      dir,
      workspace,
      trust,
      runs: [{ hubId: "reports", workflowId: "weekly-report" }],
      ending: runMessages.nothingRan(),
    },
  );
  try {
    const started = await new WorkflowRuns(engine.executor).startRun(
      workspace,
      "reports/weekly-report",
      {},
      { version: { reads: "saved-files" } },
    );
    expect(started.found).toBe("one");
  } finally {
    await engine.close();
  }
  return { trusts, debugLines, stuck: engine.stuck.aborted };
}
