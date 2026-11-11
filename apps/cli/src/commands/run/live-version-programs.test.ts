import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { nodeProgramStarter } from "@halonicjs/adapter-mcp";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import { connectorConfigOf } from "@halonicjs/app";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cliConnectorFactories } from "../../connector-machine.ts";
import { loadRunWorkspace, openGitHistory } from "../../run-workspace.ts";

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
  await rm(folder, { recursive: true, force: true });
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

/** Loads the workspace as `halonic run` does, then calls `which` on its notes connector. */
async function askNotesFromALiveRun(): Promise<string> {
  const history = async (root: string) => openGitHistory(root, { git: await testGit() });
  const dir = { root: acme, shown: ".", name: "acme", store: new FolderDefinitionStore(acme, ".") };
  const loaded = await loadRunWorkspace(dir, history);
  if (loaded.found !== "loaded") throw new Error(`The live version didn't load: ${loaded.found}.`);
  const notes = filesOf(loaded.workspace, "connector").find((file) => file.value.id === "notes");
  if (notes === undefined) throw new Error("The live version has no notes connector.");

  const factories = cliConnectorFactories(nodeProgramStarter, process.env);
  const client = factories.create(connectorConfigOf(notes.value), {
    secrets: new MemorySecrets({}),
    tokens: new MemoryTokenStore(),
    http: { fetch: async () => new Response("unused") },
    workspaceRoot: acme,
    trust: contractGrant,
  });
  try {
    return await client.callTool("which", {});
  } finally {
    await client.close();
  }
}

verifies("app.runs-read-latest-version", () => {
  // Today's known limit (HAL-4966): the program reads the saved folder, not
  // the live version. This flips when programs run from a copy at the live
  // commit (HAL-4975).
  it(
    "starts a connector's saved script in a live run, even when that change isn't live yet",
    async () => {
      await save(connectorFile, notesConnector);
      await save(scriptFile, notesServer("the live script"));
      await makeLive();
      await save(scriptFile, notesServer("the saved script"));

      expect(await askNotesFromALiveRun()).toBe("the saved script");
    },
    gitTimeout,
  );
});
