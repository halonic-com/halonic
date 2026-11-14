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
function trustedAs(trusted: boolean): Pick<WorkspaceTrust, "check" | "isTrusted" | "refresh"> {
  return {
    check: trusted
      ? ({ status: "trusted", grant } as unknown as WorkspaceTrust["check"])
      : ({ status: "new" } as unknown as WorkspaceTrust["check"]),
    isTrusted: () => trusted,
    refresh: async () => undefined,
  };
}

function hostOf(
  options: { trusted?: boolean; tools?: ConnectorTool[]; files?: MemoryDefinitionStore } = {},
) {
  const started: ConnectorFactoryContext[] = [];
  const approvals = new MemoryToolApprovalStore();
  const host = new WorkspaceListedTools({
    definitions: options.files ?? acmeFiles(),
    folder: new MemoryFolderReader(),
    trust: trustedAs(options.trusted ?? true),
    approvals,
    digest: webCryptoDigest,
    clock: new ManualClock(),
    secrets: new MemorySecrets(),
    tokens: new MemoryTokenStore(),
    http: { fetch: () => Promise.reject(new Error("This test reaches no server.")) },
    listTools: async (_config, context) => {
      started.push(context);
      return options.tools ?? [readNote];
    },
  });
  return { host, started, approvals };
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

    it("starts nothing in a workspace that isn't trusted as it is now", async () => {
      const { host, started } = hostOf({ trusted: false });

      await expect(host.review("notes")).rejects.toThrow("isn't trusted");

      expect(started).toEqual([]);
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

    it("can't check an http server yet, and starts nothing", async () => {
      const files = acmeFiles({
        "library/connectors/search.connector.yaml":
          "transport: { http: { url: https://search.acme.example/mcp } }\n",
      });
      const { host, started } = hostOf({ files });

      await expect(host.review("search")).rejects.toThrow("http server");

      expect(started).toEqual([]);
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
