import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
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
import { FakeMcpServers } from "./test/fake-mcp-servers.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import { assertTrustable, cliTrustService, readWorkspaceTrust } from "./workspace-trust.ts";

const noCommands = { path: undefined, endings: [] };
const clock = fixedClock(Date.UTC(2026, 10, 11, 9));
const notesTool = {
  name: "read_note",
  description: "Reads one note.",
  inputSchema: { type: "object" },
};

let folder: string;
let servers: FakeMcpServers;
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
  servers = new FakeMcpServers([notesTool]);
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
  await removeTestFolder(folder);
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
    const read = await readWorkspaceTrust(dir, noCommands);
    const { subject } = read;
    const service = cliTrustService(machine.trustStore, clock);
    const check = await service.check(subject);
    assertTrustable(check, read);
    expect((await service.grant(subject, check.fingerprint, "cli")).ok).toBe(true);
  };
  return { target: { dir, typedDir: undefined, connector: connector.value, workspace }, trust };
}

verifies("cli.source-listing", () => {
  describe("readSourceListing", () => {
    it("reads a trusted stdio source's tools from its program, then stops it", async () => {
      const { target, trust } = await acmeNotes();
      await trust();
      const { tools, trust: grant } = await readSourceListing(
        target,
        machine,
        new MemorySecrets(),
        runMessages.nothingRan(),
      );
      expect(tools).toEqual([
        { name: "read_note", description: "Reads one note.", parameters: { type: "object" } },
      ]);
      expect(grant.fingerprint).toMatch(/^hfp1:/u);
      expect(servers.started.map((launch) => launch.program)).toEqual(["acme-notes-server"]);
      expect(servers.started[0]?.cwd).toBe(target.dir.root);
      expect(servers.started[0]?.workingFolders).toBeUndefined();
      expect(servers.running).toBe(0);
    });

    it("gives the program's starter every harness agent's working folder, as a real path", async () => {
      const acme = join(folder, "acme");
      await mkdir(join(acme, "agents"));
      await writeFile(join(acme, "agents", "coder.agent.yaml"), "name: Coder\nharness: codex\n");
      const { target, trust } = await acmeNotes();
      await trust();
      await readSourceListing(target, machine, new MemorySecrets(), runMessages.nothingRan());
      expect(servers.started[0]?.workingFolders).toEqual({
        workspaceRoot: target.dir.root,
        folders: [join(await realpath(acme), "files", "agents", "coder")],
      });
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

    it("checks trust on the workspace it starts the program from, not on a second read", async () => {
      const { target, trust } = await acmeNotes();
      // The files change after the source was loaded, and that version is trusted.
      await writeFile(
        join(folder, "acme", "library", "connectors", "notes.connector.yaml"),
        "name: Notes\ntransport:\n  stdio:\n    command: acme-notes-server-2\n",
      );
      await trust();
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
