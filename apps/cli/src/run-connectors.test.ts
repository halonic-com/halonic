import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { ConnectorFactories } from "@halonicjs/app";
import type { ConnectorsRun } from "@halonicjs/engine";
import type { RunVersion } from "@halonicjs/events";
import type { Connector } from "@halonicjs/format";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FolderRunConnectors } from "./run-connectors.ts";

const live: RunVersion = {
  reads: "live-version",
  commit: "4f2a9c0de1b2",
  versionDate: "2026-11-11T10:42:00.000Z",
};

/** A top-level run of Support reply that read `version`, in a workspace that is local only or not. */
function runOf(runId: string, version: RunVersion | null = live, localOnly = false): ConnectorsRun {
  return { runId, hubId: "support", workflowId: "support-reply", version, localOnly };
}

const notes: Connector = {
  id: "notes",
  name: "Notes",
  transport: { stdio: { command: "node", args: ["server.js"] } },
} as Connector;

/** What happened, in order: folders made and released, connectors created and closed. */
interface Fixture {
  readonly connectors: FolderRunConnectors;
  readonly log: string[];
  readonly reported: unknown[];
  readonly contexts: ConnectorFactoryContext[];
}

function fixture(options: { closeFails?: boolean; files?: readonly Connector[] } = {}): Fixture {
  const log: string[] = [];
  const reported: unknown[] = [];
  const contexts: ConnectorFactoryContext[] = [];
  let copies = 0;
  const stdio: ConnectorFactory = {
    transport: "stdio",
    create: (config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient => {
      if (config.id === "broken") throw new Error(`Connector "broken" can't be created.`);
      contexts.push(context);
      log.push(`create ${config.id} in ${context.workspaceRoot}`);
      return {
        id: config.id,
        listTools: async () => [],
        callTool: async () => "",
        close: async () => {
          log.push(`close ${config.id}`);
          if (options.closeFails === true) throw new Error("the program didn't stop");
        },
      };
    },
  };
  const connectors = new FolderRunConnectors({
    factories: new ConnectorFactories([stdio]),
    programFolders: {
      folderFor: async (version) => {
        copies += 1;
        const path = version.reads === "live-version" ? `/copies/${copies}` : "/work/acme";
        log.push(`folder ${path}`);
        return { path, release: async () => void log.push(`release ${path}`) };
      },
    },
    context: {
      secrets: { get: async () => null },
      tokens: new MemoryTokenStore(),
      http: { fetch: async () => new Response("unused") },
      trust: null,
    },
    connectorsOf: async () => options.files ?? [notes],
    workingFoldersOf: async (folder) => [`${folder}/files/agents/coder`],
    reportError: (error) => reported.push(error),
  });
  return { connectors, log, reported, contexts };
}

verifies("cli.local-engine", () => {
  it("starts a run's connectors once, in a copy at the run's commit, with its working folders", async () => {
    const { connectors, log, contexts } = fixture();

    const first = await connectors.open(runOf("run_1"));
    const again = await connectors.open(runOf("run_1"));

    expect(again).toBe(first);
    expect(log).toEqual(["folder /copies/1", "create notes in /copies/1"]);
    expect(contexts[0]?.workingFolders).toEqual(["/copies/1/files/agents/coder"]);
  });

  it("marks a connector that runs on this computer as local, so a local-only run calls it", async () => {
    const { connectors } = fixture();

    const opened = await connectors.open(runOf("run_1", live, true));

    expect(opened.map(({ id, local }) => ({ id, local }))).toEqual([{ id: "notes", local: true }]);
  });

  it("doesn't start a connector its file says isn't local in a local-only run", async () => {
    const remote = { ...notes, id: "remote", local: false } as Connector;
    const { connectors, log } = fixture({ files: [notes, remote] });

    const opened = await connectors.open(runOf("run_1", live, true));
    await connectors.open(runOf("run_2"));

    expect(opened.map((each) => each.id)).toEqual(["notes"]);
    expect(log.filter((line) => line.startsWith("create"))).toEqual([
      "create notes in /copies/1",
      "create notes in /copies/2",
      "create remote in /copies/2",
    ]);
  });

  it("gives each top-level run its own copy", async () => {
    const { connectors, log } = fixture();

    await Promise.all([connectors.open(runOf("run_1")), connectors.open(runOf("run_2"))]);

    expect(log.filter((line) => line.startsWith("folder"))).toEqual([
      "folder /copies/1",
      "folder /copies/2",
    ]);
  });

  it("starts a saved-files run's connectors in the workspace folder", async () => {
    const { connectors, log } = fixture();

    await connectors.open(runOf("run_1", { reads: "saved-files" }));

    expect(log).toEqual(["folder /work/acme", "create notes in /work/acme"]);
  });

  it("closes a run's connectors before it releases their copy", async () => {
    const { connectors, log } = fixture();
    await connectors.open(runOf("run_1"));

    await connectors.end("run_1");
    await connectors.end("run_1");

    expect(log.slice(2)).toEqual(["close notes", "release /copies/1"]);
  });

  it("reports a connector that didn't close, and still releases its copy", async () => {
    const { connectors, log, reported } = fixture({ closeFails: true });
    await connectors.open(runOf("run_1"));

    await connectors.end("run_1");

    expect(reported).toEqual([new Error("the program didn't stop")]);
    expect(log.at(-1)).toBe("release /copies/1");
  });

  it("starts nothing for a run that names no version", async () => {
    const { connectors, log } = fixture();

    await expect(connectors.open(runOf("run_1", null))).rejects.toThrow(
      `Run "run_1" doesn't name the version of the workspace it read, so its connectors can't start.`,
    );
    expect(log).toEqual([]);
  });

  it("releases the copy when a connector can't be created, and tries again at the next open", async () => {
    const broken = { ...notes, id: "broken" } as Connector;
    const { connectors, log } = fixture({ files: [notes, broken] });

    await expect(connectors.open(runOf("run_1"))).rejects.toThrow(
      `Connector "broken" can't be created.`,
    );
    await expect(connectors.open(runOf("run_1"))).rejects.toThrow(
      `Connector "broken" can't be created.`,
    );

    expect(log).toEqual([
      "folder /copies/1",
      "create notes in /copies/1",
      "close notes",
      "release /copies/1",
      "folder /copies/2",
      "create notes in /copies/2",
      "close notes",
      "release /copies/2",
    ]);
  });

  it("ends every run still open when the engine closes", async () => {
    const { connectors, log } = fixture();
    await connectors.open(runOf("run_1"));
    await connectors.open(runOf("run_2"));

    await connectors.closeAll();

    expect(log.filter((line) => line.startsWith("release")).sort()).toEqual([
      "release /copies/1",
      "release /copies/2",
    ]);
  });
});
