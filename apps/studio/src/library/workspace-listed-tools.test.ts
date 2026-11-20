import { ConnectorFailedError } from "@halonicjs/adapter-agent-host-client";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import {
  ManualClock,
  MemoryDefinitionStore,
  MemoryFolderReader,
  MemorySecrets,
  MemoryTokenStore,
  MemoryToolApprovalStore,
} from "@halonicjs/adapter-memory";
import type { ConnectorFactoryContext, ConnectorTool } from "@halonicjs/ports";
import { ConnectorCouldntList } from "@halonicjs/studio-feature-library/api";
import { EngineNotAnswering } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { WorkspaceListedTools } from "./workspace-listed-tools.ts";

const notesFile = "name: Notes\ntransport:\n  stdio:\n    command: acme-notes-server\n";
const grant = { location: "memory:folder", fingerprint: "hfp1:made-up" };

const readNote: ConnectorTool = {
  name: "read_note",
  description: "Reads one note.",
  parameters: { type: "object" },
};

function acmeFiles(extra: Record<string, string> = {}): MemoryDefinitionStore {
  return new MemoryDefinitionStore({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/notes.connector.yaml": notesFile,
    ...extra,
  });
}

/** A trust that answers as the page's does, without reading a folder. */
function trustedAs(trusted: boolean): Pick<WorkspaceTrust, "checkLoaded"> {
  return {
    checkLoaded: async () =>
      (trusted ? { status: "trusted", grant } : { status: "new" }) as unknown as Awaited<
        ReturnType<WorkspaceTrust["checkLoaded"]>
      >,
  };
}

function hostOf(
  options: {
    trusted?: boolean;
    tools?: ConnectorTool[];
    files?: MemoryDefinitionStore;
    trust?: Pick<WorkspaceTrust, "checkLoaded">;
    /** What starting the connector rejects with, instead of listing its tools. */
    listError?: unknown;
  } = {},
) {
  const started: ConnectorFactoryContext[] = [];
  const startedConfigs: unknown[] = [];
  const approvals = new MemoryToolApprovalStore();
  const host = new WorkspaceListedTools({
    definitions: options.files ?? acmeFiles(),
    folder: new MemoryFolderReader(),
    trust: options.trust ?? trustedAs(options.trusted ?? true),
    approvals,
    digest: webCryptoDigest,
    clock: new ManualClock(),
    secrets: new MemorySecrets(),
    tokens: new MemoryTokenStore(),
    http: { fetch: () => Promise.reject(new Error("This test reaches no server.")) },
    listTools: async (config, context) => {
      started.push(context);
      startedConfigs.push(config);
      if ("listError" in options) throw options.listError;
      return options.tools ?? [readNote];
    },
  });
  return { host, started, startedConfigs, approvals };
}

verifies("studio.workspace-listed-tools", () => {
  describe("review", () => {
    it("starts a trusted workspace's connector and lists its tools as not approved", async () => {
      const { host, started } = hostOf();

      const snapshot = await host.review("notes");

      expect(snapshot.sourceName).toBe("Notes");
      expect(snapshot.toReview.map((row) => [row.name, row.state])).toEqual([
        ["read_note", "not_approved"],
      ]);
      expect(started).toHaveLength(1);
      expect(started[0]?.trust).toEqual(grant);
      expect(started[0]?.workspaceRoot).toBe("memory:folder");
    });

    it("says a tool asks before each use unless the connector's read list marks it, as a run does", async () => {
      const archiveNote: ConnectorTool = { ...readNote, name: "archive_note" };
      const { host } = hostOf({
        tools: [readNote, archiveNote],
        files: acmeFiles({
          "library/connectors/notes.connector.yaml": `${notesFile}tools:\n  read: [read_note]\n`,
        }),
      });

      const snapshot = await host.review("notes");

      expect(snapshot.toReview.map((row) => [row.name, row.asksBeforeUse])).toEqual([
        ["read_note", false],
        ["archive_note", true],
      ]);
    });

    it("shows only the tools the connector's allow offers to agents", async () => {
      const { host } = hostOf({
        files: acmeFiles({
          "library/connectors/notes.connector.yaml": `${notesFile}tools:\n  allow: [read_note]\n`,
        }),
        tools: [readNote, { ...readNote, name: "delete_note", description: "Deletes a note." }],
      });

      const snapshot = await host.review("notes");

      expect(snapshot.toReview.map((row) => row.name)).toEqual(["read_note"]);
    });

    it("names an unnamed workspace by its folder, as the CLI does", async () => {
      const { host } = hostOf({
        files: new MemoryDefinitionStore({
          "workspace.yaml": "id: acme\n",
          "library/connectors/notes.connector.yaml": notesFile,
        }),
      });

      const snapshot = await host.review("notes");

      // The test folder's location is "memory:folder", with no separator to cut at.
      expect(snapshot.workspaceName).toBe("memory:folder");
    });

    it("starts nothing in a workspace that isn't trusted as it is now", async () => {
      const { host, started } = hostOf({ trusted: false });

      // A kinded error, so the page shows this sentence rather than "can't explain yet".
      await expect(host.review("notes")).rejects.toMatchObject({
        kind: "denied",
        message: expect.stringContaining("isn't trusted"),
      });

      expect(started).toEqual([]);
    });

    it("passes on why the agent host couldn't list the tools, for the page to word", async () => {
      const failed = new ConnectorFailedError({ reason: "program-missing", program: "npx" });
      const { host } = hostOf({ listError: failed });

      const error = await host.review("notes").catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(ConnectorCouldntList);
      expect(error).toMatchObject({
        failure: { reason: "program-missing", program: "npx" },
        cause: failed,
      });
    });

    it("passes on all the connector's secrets with a refused one, since the server doesn't say which", async () => {
      const withSecrets = (env: string) =>
        acmeFiles({
          "library/connectors/notes.connector.yaml": `${notesFile}    secretEnv:\n${env}`,
        });
      const refused = new ConnectorFailedError({ reason: "secret-refused" });

      const one = hostOf({
        files: withSecrets("      NOTES_TOKEN: notes-token\n"),
        listError: refused,
      });
      await expect(one.host.review("notes")).rejects.toMatchObject({
        failure: { reason: "secret-refused", secrets: ["notes-token"] },
      });

      const two = hostOf({
        files: withSecrets("      NOTES_TOKEN: notes-token\n      NOTES_KEY: notes-key\n"),
        listError: refused,
      });
      await expect(two.host.review("notes")).rejects.toMatchObject({
        failure: { reason: "secret-refused", secrets: ["notes-token", "notes-key"] },
      });

      const none = hostOf({ listError: refused });
      await expect(none.host.review("notes")).rejects.toMatchObject({
        failure: { reason: "secret-refused", secrets: [] },
      });
    });

    it("passes on an engine that isn't answering as it is", async () => {
      const { host } = hostOf({ listError: new EngineNotAnswering() });

      await expect(host.review("notes")).rejects.toBeInstanceOf(EngineNotAnswering);
    });

    it("starts what it found trusted, even when the files change right after the check", async () => {
      const files = acmeFiles();
      const trust: Pick<WorkspaceTrust, "checkLoaded"> = {
        checkLoaded: async (workspace) => {
          const checked = await trustedAs(true).checkLoaded(workspace);
          // A pull or a tool rewrites the connector after the check, before anything starts.
          await files.write(
            "library/connectors/notes.connector.yaml",
            "name: Notes\ntransport:\n  stdio:\n    command: evil-server\n",
          );
          return checked;
        },
      };
      const { host, startedConfigs } = hostOf({ files, trust });

      await host.review("notes");

      expect(JSON.stringify(startedConfigs)).toContain("acme-notes-server");
      expect(JSON.stringify(startedConfigs)).not.toContain("evil-server");
    });

    it("says so for a connector the workspace doesn't have", async () => {
      await expect(hostOf().host.review("mail")).rejects.toThrow('no connector "mail"');
    });

    it("starts nothing for a Google connector, whose tools are built in", async () => {
      const files = acmeFiles({
        "library/connectors/mail.connector.yaml":
          "transport: { google: { account: sam@acme.example } }\n",
      });
      const { host, started } = hostOf({ files });

      const snapshot = await host.review("mail");

      expect(snapshot.toReview).toEqual([]);
      expect(started).toEqual([]);
    });

    it("opens an http server's page with nothing to review, and starts nothing", async () => {
      const files = acmeFiles({
        "library/connectors/search.connector.yaml":
          "transport: { http: { url: https://search.acme.example/mcp } }\n",
      });
      const { host, started } = hostOf({ files });

      const snapshot = await host.review("search");

      expect(snapshot.toReview).toEqual([]);
      expect(started).toEqual([]);
    });
  });

  describe("asks before each use", () => {
    const lookup: ConnectorTool = {
      name: "lookup",
      description: "Finds a note.",
      parameters: { type: "object" },
    };
    const updateNote: ConnectorTool = {
      name: "update_note",
      description: "Changes a note.",
      parameters: { type: "object" },
    };

    /** The rows' `asksBeforeUse`, by name, for the notes connector with these `tools:` lines. */
    async function asksOf(toolsLines: string, tools: ConnectorTool[]) {
      const files = acmeFiles({
        "library/connectors/notes.connector.yaml": notesFile + toolsLines,
      });
      const snapshot = await hostOf({ files, tools }).host.review("notes");
      return Object.fromEntries(snapshot.toReview.map((row) => [row.name, row.asksBeforeUse]));
    }

    it("asks before every tool of a connector with no tools section", async () => {
      expect(await asksOf("", [lookup, updateNote])).toEqual({ lookup: true, update_note: true });
    });

    it("asks before a tool that approve and read both name", async () => {
      const lines = "tools:\n  approve: [lookup]\n  read: [lookup]\n";
      expect(await asksOf(lines, [lookup])).toEqual({ lookup: true });
    });

    it("asks before a tool its listing says sends, even when the read list marks it", async () => {
      const sends: ConnectorTool = { ...lookup, risk: "send" };
      expect(await asksOf("tools:\n  read: [lookup]\n", [sends])).toEqual({ lookup: true });
    });

    it("says an approved tool the read list marks runs without asking", async () => {
      const files = acmeFiles({
        "library/connectors/notes.connector.yaml": `${notesFile}tools:\n  read: [lookup]\n`,
      });
      const { host } = hostOf({ files, tools: [lookup, updateNote] });
      const picks = (await host.review("notes")).toReview.map((row) => ({
        name: row.name,
        fingerprint: row.fingerprint,
      }));
      await host.approve("notes", picks);

      const snapshot = await host.review("notes");

      expect(snapshot.approved).toEqual(["lookup", "update_note"]);
      expect(snapshot.approvedWithoutAsking).toEqual(["lookup"]);
    });
  });

  describe("approve", () => {
    it("approves the version shown, so the tool is on, and tells its listeners", async () => {
      const { host } = hostOf();
      const heard: string[] = [];
      host.subscribe(() => heard.push("changed"));
      const [row] = (await host.review("notes")).toReview;

      const result = await host.approve("notes", [
        { name: "read_note", fingerprint: row?.fingerprint ?? "" },
      ]);

      expect(result).toEqual({ approved: ["read_note"], changed: [] });
      expect((await host.review("notes")).approved).toEqual(["read_note"]);
      expect(heard).toEqual(["changed"]);
    });

    it("approves nothing for a tool whose version isn't the one shown", async () => {
      const { host } = hostOf();

      const result = await host.approve("notes", [
        { name: "read_note", fingerprint: "htl1:another" },
      ]);

      expect(result).toEqual({ approved: [], changed: ["read_note"] });
      expect((await host.review("notes")).approved).toEqual([]);
    });

    it("says why a tool the server no longer lists can't be approved", async () => {
      const { host } = hostOf();

      await expect(
        host.approve("notes", [{ name: "gone", fingerprint: "htl1:abc" }]),
      ).rejects.toThrow('doesn\'t list "gone"');
    });
  });

  describe("approve, partly refused", () => {
    it("tells its listeners about the picks saved before a refusal, and says they were saved", async () => {
      const { host } = hostOf();
      const heard: string[] = [];
      host.subscribe(() => heard.push("changed"));
      const [row] = (await host.review("notes")).toReview;

      await expect(
        host.approve("notes", [
          { name: "read_note", fingerprint: row?.fingerprint ?? "" },
          { name: "gone", fingerprint: "htl1:abc" },
        ]),
      ).rejects.toThrow("read_note were approved first");

      expect(heard).toEqual(["changed"]);
      expect((await host.review("notes")).approved).toEqual(["read_note"]);
    });

    it("starts nothing to approve a Google connector's tools", async () => {
      const files = acmeFiles({
        "library/connectors/mail.connector.yaml":
          "transport: { google: { account: sam@acme.example } }\n",
      });
      const { host, started } = hostOf({ files });

      await expect(host.approve("mail", [])).rejects.toThrow("nothing to approve");

      expect(started).toEqual([]);
    });
  });

  it("turns a tool off again when its approval is removed", async () => {
    const { host } = hostOf();
    const [row] = (await host.review("notes")).toReview;
    await host.approve("notes", [{ name: "read_note", fingerprint: row?.fingerprint ?? "" }]);

    await host.removeApproval("notes", "read_note");

    expect((await host.review("notes")).approved).toEqual([]);
  });

  it("stops telling a listener that unsubscribed", async () => {
    const { host } = hostOf();
    const heard: string[] = [];
    const stop = host.subscribe(() => heard.push("changed"));
    stop();

    await host.removeApproval("notes", "read_note");

    expect(heard).toEqual([]);
  });
});
