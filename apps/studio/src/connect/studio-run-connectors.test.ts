import type { AgentHostAnswer, AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import {
  MemoryDefinitionStore,
  MemoryFolderReader,
  MemorySecrets,
  MemoryTokenStore,
} from "@halonicjs/adapter-memory";
import type { ConnectorsRun } from "@halonicjs/engine";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { noHttpInStudio } from "./agent-host-tool-lister.ts";
import { studioRunConnectors } from "./studio-run-connectors.ts";

const grant = { location: "memory:folder", fingerprint: "hfp1:made-up" };

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

/** An agent host that opens a connector, and records each route with its body. */
function fixture(trusted: boolean) {
  const sent: { route: string; body: unknown }[] = [];
  const answers: Record<string, AgentHostAnswer> = {
    "POST /v1/connectors/open": { status: 200, body: { connector: "c1" } },
    "POST /v1/connectors/call": { status: 200, body: { text: "a note" } },
    "POST /v1/connectors/close": { status: 200, body: { closed: true } },
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
    definitions: new MemoryDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "hubs/support/library/connectors/notes.connector.yaml":
        "name: Notes\ntransport:\n  stdio:\n    command: acme-notes-server\n",
    }),
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
});
