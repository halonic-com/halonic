import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { WorkflowRuns } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { profileFolder, trustFolder } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../src/command.ts";
import { runMessages } from "../src/messages/run.ts";
import { removeTestFolder } from "../src/test/remove-folder.ts";
import { openWorkspaceDir } from "../src/workspace-dir.ts";
import { openWorkspaceEngine } from "../src/workspace-engine.ts";
import { nodeProfileEnvironment } from "../src/workspace-runs.ts";
import {
  assertTrustable,
  cliTrustService,
  readWorkspaceTrust,
  trustedGrant,
  type WorkspaceTrustMachine,
} from "../src/workspace-trust.ts";

// A local integration started by a run in the real runner and the real srt
// sandbox (HAL-8089): the trust check, the start gate, the built runner and
// the bridge are this computer's. Only the model is the test model. The other
// tests of the opener fake the runner, so they can't see that a real start
// works end to end, or that it is refused before any process starts.
//
// Like the other tests against the real fence, it lives outside `src` and runs
// with `pnpm test:fence` in the sandbox CI jobs, after `pnpm build` of the
// integration runner. It never skips: on a machine where the sandbox can't
// start it fails, on purpose.

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const runTimeout = 120_000;
const homeKey = "HALONIC_HOME";
const clock = fixedClock(Date.UTC(2026, 10, 13, 9));
const noCommands = { path: undefined, endings: [] };

const sheet = `id: notes
version: 1.0.0
kit: 1
provides: [connector]
hosts: [api.example.com]
tools:
  - { name: read-note, description: Reads a note., risk: read, untrusted: true }
`;

/** The backend a person wrote: one tool that answers a fixed line. */
const backend = `export default {
  name: "notes",
  version: "1.0.0",
  tools: [
    {
      name: "read-note",
      description: "Reads a note.",
      parameters: { type: "object", properties: {} },
      risk: "read",
      untrusted: true,
    },
  ],
  connect: () => ({
    callTool: async () => "the note from the runner",
    close: async () => undefined,
  }),
};
`;

let folder: string;
let acme: string;
let home: string;
let savedHome: string | undefined;
const debugLines: string[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-integration-fence-"));
  acme = join(folder, "acme");
  home = join(folder, "profile");
  await cp(acmeExample, acme, { recursive: true });
  // The command reads the profile from the environment, as a person's command does.
  savedHome = process.env[homeKey];
  process.env[homeKey] = home;
  debugLines.length = 0;
  await put({
    // The Reporter's tool is a local integration; the test model calls it once.
    "library/connectors/notes.connector.yaml": [
      "id: notes",
      "name: Notes",
      "transport:",
      "  integration:",
      "    folder: notes",
      // The workspace is local-only: only a connector that says it is local is started.
      "local: true",
      "tools:",
      "  allow: [read-note]",
      "  read: [read-note]",
      "",
    ].join("\n"),
    "integrations/notes/integration.yaml": sheet,
    "integrations/notes/backend/index.js": backend,
    "hubs/reports/agents/reporter.agent.yaml":
      "id: reporter\nname: Reporter\nconnectors: [notes]\ninstructions: Ask the notes.\n",
    "providers/mock.yaml":
      'id: mock\nname: Test model\ntype: mock\nlocal: true\noptions:\n  script:\n    reporter: ["tool:read-note {}", "Done"]\n',
  });
});

afterEach(async () => {
  if (savedHome === undefined) delete process.env[homeKey];
  else process.env[homeKey] = savedHome;
  await removeTestFolder(folder);
});

async function put(files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(acme, path)), { recursive: true });
    await writeFile(join(acme, path), text);
  }
}

/** The trust records of the profile `HALONIC_HOME` names, as `halonic trust` writes them. */
function trustMachine(): WorkspaceTrustMachine {
  const profile = profileFolder({ ...nodeProfileEnvironment(), variables: { HALONIC_HOME: home } });
  return { trustStore: new FileTrustStore(trustFolder(profile)), clock, commandSearch: noCommands };
}

/** Trusts the workspace as it is now, as `halonic trust` would. */
async function trust(): Promise<void> {
  const machine = trustMachine();
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const loaded = await loadWorkspace(dir.store);
  const read = await readWorkspaceTrust(dir, noCommands, loaded);
  const service = cliTrustService(machine.trustStore, machine.clock);
  const check = await service.check(read.subject);
  assertTrustable(check, read);
  const granted = await service.grant(read.subject, check.fingerprint, "cli");
  if (!granted.ok) throw new Error(`The workspace couldn't be trusted: ${granted.error.kind}`);
}

/** What the run's events say, as one text, and whether it completed. */
interface RunOutcome {
  readonly status: string;
  readonly text: string;
}

/** Runs Weekly report in an engine with this computer's real connectors; its Reporter calls the integration's tool once. */
async function runReport(): Promise<RunOutcome> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const workspace = await loadWorkspace(dir.store);
  const grant = await trustedGrant(
    dir,
    trustMachine(),
    undefined,
    runMessages.nothingRan(),
    workspace,
  );
  const context = {
    cwd: acme,
    secrets: { get: async () => null },
    signal: new AbortController().signal,
    debug: (line: unknown) => debugLines.push(JSON.stringify(line)),
  } as unknown as CommandContext;
  const engine = await openWorkspaceEngine(
    context,
    {
      http: { fetch: () => Promise.reject(new TypeError("The run calls no server.")) },
      profile: { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: home } },
      sandboxGate: () => ({
        sandbox: { check: () => Promise.reject(new Error("The agent needs no sandbox.")) },
        placement: { where: () => Promise.reject(new Error("The agent needs no placement.")) },
      }),
    },
    {
      dir,
      workspace,
      trust: grant,
      runs: [{ hubId: "reports", workflowId: "weekly-report" }],
      ending: runMessages.nothingRan(),
    },
  );
  const events: RunEvent[] = [];
  try {
    const started = await new WorkflowRuns(engine.executor).startRun(
      workspace,
      "reports/weekly-report",
      {},
      { version: { reads: "saved-files" }, onEvent: (event) => events.push(event) },
    );
    if (started.found !== "one") throw new Error("The workflow wasn't found.");
    return { status: started.run.summary.status, text: JSON.stringify(events) };
  } finally {
    await engine.close();
  }
}

describe("a local integration started by a run in the real runner and srt sandbox", () => {
  it(
    "calls the integration's tool through the runner for a trusted workspace",
    async () => {
      await trust();

      const outcome = await runReport();

      expect(outcome.status).toBe("completed");
      expect(outcome.text).toContain("the note from the runner");
    },
    runTimeout,
  );

  it(
    "refuses the start when a file of the integration changed after the trust, and the run does not get the tool's answer",
    async () => {
      await trust();
      await put({ "integrations/notes/backend/index.js": `${backend}// edited after trust\n` });

      // The grant is read from the files as they are now, so the change is refused at the door.
      await expect(runReport()).rejects.toThrow(/changed since you trusted it/);
    },
    runTimeout,
  );
});
