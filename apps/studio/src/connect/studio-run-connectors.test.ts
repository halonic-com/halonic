import type { AgentHostAnswer, AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import {
  MemoryDefinitionStore,
  MemoryFolderReader,
  MemorySecrets,
  MemoryTokenStore,
} from "@halonicjs/adapter-memory";
import { ProgramCopyUnavailableError } from "@halonicjs/app";
import type { ConnectorsRun } from "@halonicjs/engine";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import type { RunVersionLoads } from "../engine/page-run-versions.ts";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { noHttpInStudio } from "./agent-host-tool-lister.ts";
import { startProgramCopies, studioRunConnectors } from "./studio-run-connectors.ts";

const grant = { location: "memory:folder", fingerprint: "hfp1:made-up" };

const commit = "4f2a9c0de1b24f2a9c0de1b24f2a9c0de1b24f2a";
const copy = "/data/agent-host-program-copies/acme/4f2a9c0";

const run: ConnectorsRun = {
  runId: "run_1",
  hubId: "support",
  workflowId: "support-reply",
  version: { reads: "saved-files" },
  localOnly: false,
};

/** A trust that answers as the page's does, without reading a folder. */
function trustedAs(trusted: boolean): Pick<WorkspaceTrust, "checkLoaded"> {
  return {
    checkLoaded: async () =>
      (trusted ? { status: "trusted", grant } : { status: "new" }) as unknown as Awaited<
        ReturnType<WorkspaceTrust["checkLoaded"]>
      >,
  };
}

/** Acme's `notes` connector, whose program is `command`, and its `coder` agent in Claude Code. */
function acmeWithNotes(command: string): MemoryDefinitionStore {
  return new MemoryDefinitionStore({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/agents/coder.agent.yaml": "id: coder\nname: Coder\nharness: claude-code\n",
    "hubs/support/library/connectors/notes.connector.yaml": `name: Notes\ntransport:\n  stdio:\n    command: ${command}\n`,
  });
}

/** The live version's load, at `commit`, whose `notes` program is `acme-notes-at-commit`. */
function liveVersion(forgotten: string[] = []): RunVersionLoads {
  const atCommit = acmeWithNotes("acme-notes-at-commit");
  return {
    loadedOf: async () => ({ workspace: await loadWorkspace(atCommit), fileTexts: new Map() }),
    forget: (runId) => forgotten.push(runId),
  };
}

const liveRun: ConnectorsRun = {
  ...run,
  version: { reads: "live-version", commit, versionDate: "2026-11-11" },
};

/** An agent host that opens a connector, and records each route with its body. */
function fixture(
  trusted: boolean,
  versions?: RunVersionLoads,
  more: Record<string, AgentHostAnswer> = {},
) {
  const sent: { route: string; body: unknown }[] = [];
  const answers: Record<string, AgentHostAnswer> = {
    "POST /v1/connectors/open": { status: 200, body: { connector: "c1" } },
    "POST /v1/connectors/call": { status: 200, body: { text: "a note" } },
    "POST /v1/connectors/close": { status: 200, body: { closed: true } },
    "POST /v1/program-copies/open": { status: 200, body: { path: copy } },
    "POST /v1/program-copies/release": { status: 200, body: {} },
    "POST /v1/program-copies/start": { status: 200, body: {} },
    ...more,
  };
  const transport: AgentHostTransport = {
    request: async (route, body) => {
      sent.push({ route, body });
      return answers[route] ?? { status: 404, body: {} };
    },
    stream: () => Promise.reject(new Error("This test streams nothing.")),
  };
  const reported: unknown[] = [];
  const connectors = studioRunConnectors({
    transport,
    definitions: acmeWithNotes("acme-notes-server"),
    ...(versions === undefined ? {} : { versions }),
    folder: new MemoryFolderReader(),
    trust: trustedAs(trusted),
    secrets: new MemorySecrets(),
    tokens: new MemoryTokenStore(),
    http: noHttpInStudio,
    reportError: (error) => reported.push(error),
  });
  return { connectors, sent, reported };
}

verifies("engine.run-connectors", () => {
  it("starts a run's stdio connector through the agent host, with the saved grant and the folder", async () => {
    const { connectors, sent } = fixture(true);

    const [notes] = await connectors.open(run);
    expect(notes?.id).toBe("notes");
    await notes?.callTool("read_note", {});
    await connectors.end(run.runId);

    expect(sent.map((each) => each.route)).toEqual([
      "POST /v1/connectors/open",
      "POST /v1/connectors/call",
      "POST /v1/connectors/close",
    ]);
    expect(sent[0]?.body).toMatchObject({ trust: grant, workspaceRoot: "memory:folder" });
  });

  it("refuses a connector's program when the workspace has no grant, and starts nothing", async () => {
    const { connectors, sent } = fixture(false);

    const [notes] = await connectors.open(run);

    await expect(notes?.callTool("read_note", {})).rejects.toThrow("isn't trusted");
    expect(sent).toEqual([]);
    await connectors.end(run.runId);
  });

  it("refuses a run of the live version, and starts nothing in the saved files instead", async () => {
    const { connectors, sent } = fixture(true);
    const live: ConnectorsRun = {
      ...run,
      runId: "run_2",
      version: {
        reads: "live-version",
        commit: "4f2a9c0de1b2",
        versionDate: "2026-11-11T10:42:00.000Z",
      },
    };

    await expect(connectors.open(live)).rejects.toThrow(ProgramCopyUnavailableError);
    expect(sent).toEqual([]);
  });

  it("starts a live-version run's connectors from its version's files, in the host's copy at its commit, and releases it after they close", async () => {
    const forgotten: string[] = [];
    const { connectors, sent } = fixture(true, liveVersion(forgotten));

    const [notes] = await connectors.open(liveRun);
    await notes?.callTool("read_note", {});
    await connectors.end(liveRun.runId);

    expect(sent.map((each) => each.route)).toEqual([
      "POST /v1/program-copies/open",
      "POST /v1/connectors/open",
      "POST /v1/connectors/call",
      "POST /v1/connectors/close",
      "POST /v1/program-copies/release",
    ]);
    expect(sent[0]?.body).toEqual({ workspace: "memory:folder", commit });
    expect(sent[1]?.body).toMatchObject({
      trust: grant,
      workspaceRoot: copy,
      workingFolders: [`${copy}/files/agents/coder`],
    });
    expect(JSON.stringify(sent[1]?.body)).toContain("acme-notes-at-commit");
    expect(sent[4]?.body).toEqual({ workspace: "memory:folder", path: copy });
    expect(forgotten).toEqual(["run_1"]);
  });

  it("releases a live run's copy when the engine closes with the run still going", async () => {
    const { connectors, sent } = fixture(true, liveVersion());

    const [notes] = await connectors.open(liveRun);
    await notes?.callTool("read_note", {});
    await connectors.closeAll();

    expect(sent.map((each) => each.route).slice(-2)).toEqual([
      "POST /v1/connectors/close",
      "POST /v1/program-copies/release",
    ]);
  });

  it("fails a live run's connectors when the host can't make the copy, and starts nothing in the workspace folder", async () => {
    const { connectors, sent } = fixture(true, liveVersion(), {
      "POST /v1/program-copies/open": {
        status: 422,
        body: { error: { kind: "program_copy_refused", message: "No such commit." } },
      },
    });

    await expect(connectors.open(liveRun)).rejects.toThrow(ProgramCopyUnavailableError);
    expect(sent.map((each) => each.route)).toEqual(["POST /v1/program-copies/open"]);
  });
});

verifies("studio.engine-service", () => {
  it("sweeps the host's program copies of the workspace as the engine opens", async () => {
    const { sent } = fixture(true);
    const reported: unknown[] = [];
    const transport = recordingTransport(sent, { status: 200, body: {} });

    await startProgramCopies({
      transport,
      folder: new MemoryFolderReader(),
      reportError: (error) => reported.push(error),
    });

    expect(sent).toEqual([
      { route: "POST /v1/program-copies/start", body: { workspace: "memory:folder" } },
    ]);
    expect(reported).toEqual([]);
  });

  it("reports a sweep the host refuses, and doesn't throw, so the engine opens all the same", async () => {
    const reported: unknown[] = [];
    const transport = recordingTransport([], {
      status: 422,
      body: {
        error: { kind: "program_copy_refused", message: "The copies folder can't be emptied." },
      },
    });

    await startProgramCopies({
      transport,
      folder: new MemoryFolderReader(),
      reportError: (error) => reported.push(error),
    });

    expect(reported).toEqual([expect.objectContaining({ kind: "program_copy_refused" })]);
  });
});

/** A transport that answers every request with `answer`, and records it in `sent`. */
function recordingTransport(
  sent: { route: string; body: unknown }[],
  answer: AgentHostAnswer,
): AgentHostTransport {
  return {
    request: async (route, body) => {
      sent.push({ route, body });
      return answer;
    },
    stream: () => Promise.reject(new Error("This test streams nothing.")),
  };
}
