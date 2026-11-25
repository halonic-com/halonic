import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nodeCommandSearch } from "@halonicjs/adapter-doctor-node";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { WorkflowRuns } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { profileFolder, trustFolder } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../src/command.ts";
import { runMessages } from "../src/messages/run.ts";
import { removeTestFolder } from "../src/test/remove-folder.ts";
import { savedVersionOf } from "../src/workspace-at-version.ts";
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

// A workspace's own `stdio` connector, started by a run through the CLI's
// real wiring (HAL-17849): `openWorkspaceEngine` reads the home folder, hands
// the denied paths to the fence, and the program runs in a real srt session.
// The unit tests check `connectorDeniedPaths` on its own; only this one fails
// if the opener goes back to denying Halonic's profile alone, since the
// person's `.ssh` would then be readable.
//
// Like the other tests against the real fence, it runs with `pnpm test:fence`
// in the sandbox CI jobs and never skips.

const hostileServer = fileURLToPath(
  new URL(
    "../../../packages/adapters/connector-stdio-sandbox/fence/hostile-server.ts",
    import.meta.url,
  ),
);
const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const runTimeout = 120_000;
const clock = fixedClock(Date.UTC(2026, 10, 25, 9));
// The trust names the program `node` resolves to, as the start gate checks it.
const commands = nodeCommandSearch();

let base: string;
let acme: string;
let profile: string;
let home: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "halonic-cli-workspace-connector-"));
  acme = join(base, "acme");
  profile = join(base, "profile");
  home = join(base, "home");
  await cp(acmeExample, acme, { recursive: true });
  for (const name of ["HALONIC_HOME", "HOME"]) saved[name] = process.env[name];
  // The command reads the profile and the home folder from the environment, as a person's does.
  process.env["HALONIC_HOME"] = profile;
  process.env["HOME"] = home;
  await put(home, { ".ssh/id_test": "person-ssh-key" });
  await put(profile, { "keys.json": "halonic-profile-keys" });
  await put(acme, {
    "tools/server.ts": await readFile(hostileServer, "utf8"),
    "library/connectors/notes.connector.yaml": [
      "id: notes",
      "name: Notes",
      // The program declares no sites, so it counts as local in the local-only workspace.
      "local: true",
      "transport:",
      "  stdio:",
      "    command: node",
      "    args: [tools/server.ts]",
      "tools:",
      "  allow: [read_file, write_file]",
      "  read: [read_file, write_file]",
      "",
    ].join("\n"),
    "hubs/reports/agents/reporter.agent.yaml":
      "id: reporter\nname: Reporter\nconnectors: [notes]\ninstructions: Use the notes.\n",
    "providers/mock.yaml": `id: mock\nname: Test model\ntype: mock\nlocal: true\noptions:\n  script:\n    reporter: ${JSON.stringify(
      [
        'tool:write_file {"path":"mine.txt","text":"mine"}',
        `tool:read_file ${JSON.stringify({ path: join(home, ".ssh/id_test") })}`,
        `tool:read_file ${JSON.stringify({ path: join(profile, "keys.json") })}`,
        "Done",
      ],
    )}\n`,
  });
});

afterEach(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await removeTestFolder(base);
});

async function put(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

/** This computer's environment, with `HALONIC_HOME` naming the test's profile. */
function profileEnvironment() {
  return { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: profile } };
}

function trustMachine(): WorkspaceTrustMachine {
  return {
    trustStore: new FileTrustStore(trustFolder(profileFolder(profileEnvironment()))),
    clock,
    commandSearch: commands,
  };
}

/** Trusts the workspace as it is now, as `halonic trust` would. */
async function trust(): Promise<void> {
  const machine = trustMachine();
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const read = await readWorkspaceTrust(dir, commands, await savedVersionOf(dir));
  const service = cliTrustService(machine.trustStore, machine.clock);
  const check = await service.check(read.subject);
  assertTrustable(check, read);
  const granted = await service.grant(read.subject, check.fingerprint, "cli");
  if (!granted.ok) throw new Error(`The workspace couldn't be trusted: ${granted.error.kind}`);
}

/** What one run saw: the tool's answers in call order, and its warnings and other events, to show when the answers are missing. */
interface RunOutcome {
  readonly results: readonly string[];
  readonly others: string;
}

/** Runs Weekly report with this computer's real connectors. */
async function runReport(): Promise<RunOutcome> {
  const warnings: string[] = [];
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const version = await savedVersionOf(dir);
  const grant = await trustedGrant(
    dir,
    trustMachine(),
    undefined,
    runMessages.nothingRan(),
    version,
  );
  const context = {
    cwd: acme,
    secrets: { get: async () => null },
    signal: new AbortController().signal,
    debug: () => undefined,
    warn: (line: unknown) => warnings.push(JSON.stringify(line)),
  } as unknown as CommandContext;
  const engine = await openWorkspaceEngine(
    context,
    {
      http: { fetch: () => Promise.reject(new TypeError("The run calls no server.")) },
      profile: profileEnvironment(),
      sandboxGate: () => ({
        sandbox: { check: () => Promise.reject(new Error("The agent needs no sandbox.")) },
        placement: { where: () => Promise.reject(new Error("The agent needs no placement.")) },
      }),
    },
    {
      holder: "run",
      dir,
      workspace: version.workspace,
      integrations: version.integrations,
      trust: grant,
      runs: [{ hubId: "reports", workflowId: "weekly-report" }],
      ending: runMessages.nothingRan(),
    },
  );
  const events: RunEvent[] = [];
  try {
    await new WorkflowRuns(engine.executor).startRun(
      version.workspace,
      "reports/weekly-report",
      {},
      { version: { reads: "saved-files" }, onEvent: (event) => events.push(event) },
    );
  } finally {
    await engine.close();
  }
  return {
    results: events.flatMap((event) => (event.type === "tool.result" ? [event.result] : [])),
    others: JSON.stringify({
      warnings,
      events: events.filter((event) => event.type !== "tool.result"),
    }),
  };
}

describe("a workspace's stdio connector, started by a run through openWorkspaceEngine", () => {
  it(
    "can't read a key in the person's home folder or Halonic's profile",
    async () => {
      await trust();

      const { results, others } = await runReport();

      expect(results, others).toHaveLength(3);
      const [wrote, sshKey, profileKeys] = results;
      // It ran in its session and writes in its own working folder, so the refusals come from the fence.
      expect(wrote).toBe("wrote");
      expect(sshKey).toMatch(/^refused:/);
      expect(profileKeys).toMatch(/^refused:/);
    },
    runTimeout,
  );
});
