import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import type { ProgramLaunch, ProgramStarter, RunningProgram } from "@halonicjs/adapter-mcp";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ConnectorMachine,
  cliConnectorFactories,
  connectorHostClass,
} from "./connector-machine.ts";
import { exitCodeOfError } from "./exit-code-for.ts";
import { runMessages } from "./messages/run.ts";
import { readSourceListing } from "./source-listing.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import { cliTrustService, readWorkspaceTrust } from "./workspace-trust.ts";

const noCommands = { path: undefined, endings: [] };
const clock = fixedClock(Date.UTC(2026, 10, 11, 9));
const notesTool = {
  name: "read_note",
  description: "Reads one note.",
  inputSchema: { type: "object" },
};

/** A stdio MCP server in this process: it answers `initialize` and lists one tool. */
class FakeServers implements ProgramStarter {
  readonly started: ProgramLaunch[] = [];
  running = 0;

  async start(launch: ProgramLaunch): Promise<RunningProgram> {
    this.started.push(launch);
    this.running += 1;
    const stdout = new PassThrough();
    let resolveExit: () => void = () => undefined;
    const exited = new Promise<{ code: number; signal: null }>((resolve) => {
      resolveExit = () => resolve({ code: 0, signal: null });
    });
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      this.running -= 1;
      stdout.end();
      resolveExit();
    };
    return {
      write: async (text) => {
        for (const line of text.split("\n").filter((part) => part !== "")) {
          const answer = answerTo(JSON.parse(line) as { id?: number; method?: string });
          if (answer !== undefined) stdout.write(`${JSON.stringify(answer)}\n`);
        }
      },
      endInput: end,
      signal: end,
      stdout,
      stderr: new PassThrough({ emitClose: true }).end(),
      exited,
    };
  }
}

function answerTo(message: { id?: number; method?: string }): unknown {
  if (message.id === undefined) return undefined;
  const result =
    message.method === "initialize"
      ? { protocolVersion: "2025-11-25", capabilities: { tools: {} } }
      : { tools: [notesTool] };
  return { jsonrpc: "2.0", id: message.id, result };
}

let folder: string;
let servers: FakeServers;
let machine: ConnectorMachine;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-source-listing-"));
  const acme = join(folder, "acme");
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  await writeFile(join(acme, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(
    join(acme, "library", "connectors", "notes.connector.yaml"),
    "name: Notes\ntransport:\n  stdio:\n    command: acme-notes-server\n",
  );
  servers = new FakeServers();
  machine = {
    factories: cliConnectorFactories(servers, { PATH: "/usr/bin" }),
    http: { fetch: () => Promise.reject(new TypeError("This test reaches no server.")) },
    tokens: new MemoryTokenStore(),
    trustStore: new FileTrustStore(join(folder, "trust")),
    clock,
    commandSearch: noCommands,
  };
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Acme's folder, its loaded `notes` source, and a way to trust it as it is now. */
async function acmeNotes() {
  const dir = await openWorkspaceDir(
    { positionals: [], options: {} },
    { cwd: join(folder, "acme") },
  );
  const workspace = await loadWorkspace(dir.store);
  const connector = filesOf(workspace, "connector").find((file) => file.value.id === "notes");
  if (connector === undefined) throw new TypeError("Acme has a notes source");
  const trust = async () => {
    const { subject } = await readWorkspaceTrust(dir, noCommands);
    const service = cliTrustService(machine.trustStore, clock);
    const check = await service.check(subject);
    expect((await service.grant(subject, check.fingerprint, "cli")).ok).toBe(true);
  };
  return { target: { dir, typedDir: undefined, connector: connector.value }, trust };
}

verifies("cli.source-listing", () => {
  describe("readSourceListing", () => {
    it("reads a trusted stdio source's tools from its program, then stops it", async () => {
      const { target, trust } = await acmeNotes();
      await trust();
      const tools = await readSourceListing(
        target,
        machine,
        new MemorySecrets(),
        runMessages.nothingRan(),
      );
      expect(tools).toEqual([
        { name: "read_note", description: "Reads one note.", parameters: { type: "object" } },
      ]);
      expect(servers.started.map((launch) => launch.program)).toEqual(["acme-notes-server"]);
      expect(servers.started[0]?.cwd).toBe(target.dir.root);
      expect(servers.running).toBe(0);
    });

    it("starts nothing for an untrusted workspace, and exits with code 3", async () => {
      const { target } = await acmeNotes();
      const failure = readSourceListing(
        target,
        machine,
        new MemorySecrets(),
        runMessages.nothingRan(),
      );
      const error = await failure.then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
      expect(exitCodeOfError(error)).toBe(3);
      expect(servers.started).toEqual([]);
    });
  });

  describe("the composition root", () => {
    it("serves stdio and http connectors", () => {
      const factories = cliConnectorFactories(servers, {});
      expect(factories.serves("stdio")).toBe(true);
      expect(factories.serves("http")).toBe(true);
      expect(factories.serves("google")).toBe(false);
    });

    it.each([
      ["https://notes.acme.test/mcp", "public"],
      ["http://localhost:8080/mcp", "loopback"],
      ["http://127.0.0.1:8080/mcp", "loopback"],
      ["http://[::1]:8080/mcp", "loopback"],
      ["http://192.168.1.20/mcp", "private"],
      ["http://169.254.169.254/latest", undefined],
      ["http://0.0.0.0/mcp", undefined],
    ])("lets %s lead only to %s", (url, expected) => {
      expect(connectorHostClass(new URL(url))).toBe(expected);
    });
  });
});
