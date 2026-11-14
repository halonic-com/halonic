import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { nodeProgramStarter } from "@halonicjs/adapter-mcp";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import { liveVersionOf, WorkflowRuns } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { profileFolder } from "@halonicjs/profile";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cliConnectorFactories } from "../../connector-machine.ts";
import { openLocalEngine } from "../../local-engine-host.ts";
import { loadRunWorkspace, openGitHistory } from "../../run-workspace.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";

/** The Acme example, which the notes connector is added to. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const connectorFile = "library/connectors/notes.connector.yaml";
const scriptFile = "tools/notes/server.js";
/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

let folder: string;
let acme: string;
let runner: GitRunner;
let vcs: GitVcs;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-live-programs-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  runner = await GitRunner.create({ git: await testGit() });
  vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
});

afterEach(async () => {
  await runner.close();
  await removeTestFolder(folder);
});

/**
 * A small MCP server with one tool, `which`, that answers `answer`. It
 * reads one JSON-RPC message per line and ends when its input closes.
 */
function notesServer(answer: string): string {
  return `
const lines = require("node:readline").createInterface({ input: process.stdin });
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
lines.on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) return;
  if (method === "initialize") {
    reply(id, { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "notes", version: "1.0.0" } });
  } else if (method === "tools/list") {
    reply(id, { tools: [{ name: "which", description: "Says which script answers.", inputSchema: { type: "object" } }] });
  } else if (method === "tools/call") {
    // Outside the workspace, so the test can read which script answered.
    if (process.env.NOTES_LOG) require("node:fs").appendFileSync(process.env.NOTES_LOG, ${JSON.stringify(answer)} + "\\n");
    reply(id, { content: [{ type: "text", text: ${JSON.stringify(answer)} }] });
  }
});
`;
}

/** The notes connector: an unpinned program in the workspace, started from its own folder. */
const notesConnector = [
  "id: notes",
  "name: Notes",
  "transport:",
  "  stdio:",
  `    command: ${JSON.stringify(process.execPath)}`,
  "    args: [server.js]",
  "    cwd: tools/notes",
  "",
].join("\n");

async function save(path: string, text: string): Promise<void> {
  await mkdir(join(acme, path, ".."), { recursive: true });
  await writeFile(join(acme, path), text);
}

/** Commits every file in the workspace folder: the workspace's first version. */
async function makeLive(): Promise<void> {
  // Listed before git makes its own folder.
  const entries = await readdir(acme, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(acme, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  await vcs.init();
  await vcs.stage(files);
  await vcs.commit("First version");
}

/** Where the notes server writes what each call answered, outside the workspace. */
function notesLog(): string {
  return join(folder, "notes.log");
}

/**
 * Lists the notes connector under the Reporter's connectors, and has the
 * test model call its `which` tool once. `which` is listed under `read`, so
 * the call needs no person's OK.
 */
async function reporterCallsNotes(): Promise<void> {
  const log = `    env: { NOTES_LOG: ${JSON.stringify(notesLog())} }\n`;
  await save(connectorFile, `${notesConnector}${log}tools:\n  allow: [which]\n  read: [which]\n`);
  await save(
    "hubs/reports/agents/reporter.agent.yaml",
    "id: reporter\nname: Reporter\nconnectors: [notes]\ninstructions: Ask the notes.\n",
  );
  await save(
    "providers/mock.yaml",
    'id: mock\nname: Test model\ntype: mock\nlocal: true\noptions:\n  script:\n    reporter: ["tool:which {}", "Done"]\n',
  );
}

/**
 * Loads the workspace as `halonic run` does, runs Weekly report in the CLI's
 * engine on the live version, and gives what the notes connector's `which`
 * answered in the run, and what is left in the copies folder once it ended.
 */
async function askNotesFromALiveRun(): Promise<{ answer: string; copiesLeft: string[] }> {
  const history = async (root: string) => openGitHistory(root, { git: await testGit() });
  const dir = { root: acme, shown: ".", name: "acme", store: new FolderDefinitionStore(acme, ".") };
  const loaded = await loadRunWorkspace(dir, history);
  if (loaded.found !== "loaded") throw new Error(`The live version didn't load: ${loaded.found}.`);
  const live = await liveVersionOf(vcs);
  if (live.kind !== "commit") throw new Error("Nothing is live.");
  const version = {
    reads: "live-version",
    commit: live.commit.hash,
    versionDate: live.commit.date,
  } as const;

  const profile = {
    ...nodeProfileEnvironment(),
    variables: { HALONIC_HOME: join(folder, "profile") },
  };
  const engine = await openLocalEngine({
    workspace: loaded.workspace,
    workspaceRoot: acme,
    secrets: new MemorySecrets({}),
    http: { fetch: async () => new Response("unused") },
    environment: profile,
    git: { git: await testGit() },
    runConnectors: {
      factories: cliConnectorFactories(nodeProgramStarter, process.env),
      context: {
        http: { fetch: async () => new Response("unused") },
        tokens: new MemoryTokenStore(),
      },
      trust: contractGrant,
    },
    reportError: (error) => {
      throw error;
    },
  });
  let events: readonly RunEvent[];
  try {
    const started = await new WorkflowRuns(engine.executor).startRun(
      loaded.workspace,
      "reports/weekly-report",
      {},
      { version },
    );
    if (started.found !== "one") throw new Error("Weekly report didn't start.");
    events = started.run.events;
  } finally {
    await engine.close();
  }
  const answered = await readFile(notesLog(), "utf8").catch(() => "");
  const copies = join(profileFolder(profile).root, "workspaces");
  const [workspaceKey = ""] = await readdir(copies);
  return {
    answer: answered === "" ? `no call in ${JSON.stringify(events)}` : answered.trim(),
    copiesLeft: await readdir(join(copies, workspaceKey, "program-copies")).catch(() => []),
  };
}

verifies("app.runs-read-latest-version", () => {
  // Was the known limit of HAL-4966: the program read the saved folder.
  it(
    "starts a connector's live script in a live run, not a saved change that isn't live yet",
    async () => {
      await reporterCallsNotes();
      await save(scriptFile, notesServer("the live script"));
      await makeLive();
      await save(scriptFile, notesServer("the saved script"));

      const { answer, copiesLeft } = await askNotesFromALiveRun();

      expect(answer).toBe("the live script");
      expect(copiesLeft).toEqual([]);
    },
    gitTimeout,
  );
});
