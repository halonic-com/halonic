import type { ConnectorPin, Digest, TrustRecord } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { cliListedToolApproval } from "./cli-listed-tool-approval.ts";
import { type Phrase, plainText } from "./messages/phrase.ts";
import { waitingReporter } from "./workspace-engine.ts";

const location = "/work/acme";
const pin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/notes-mcp",
  version: "2.3.1",
};

const digest: Digest = { sha256: async (data) => new Uint8Array(32).fill(data.length & 0xff) };

/** A workspace that holds only the connector files given. */
function workspaceWith(...connectors: object[]): LoadedWorkspace {
  const files = connectors.map((value) => ({ kind: "connector", value }));
  return { files } as unknown as LoadedWorkspace;
}

const mail = {
  id: "mail",
  transport: { http: { url: "https://mail.example.com/mcp" } },
  tools: { approve: [] },
};
const notes = {
  id: "notes",
  transport: {
    stdio: { command: "npx", args: ["-y", "@acme/notes-mcp"], env: {} },
  },
  tools: { approve: [] },
};
const folderOnly = { id: "mine", transport: { integration: { folder: "integrations/mine" } } };

function approvalFor(
  workspace: LoadedWorkspace,
  trust: { get(location: string): Promise<TrustRecord | null> } = { get: async () => null },
) {
  return cliListedToolApproval({
    location,
    workspace: () => workspace,
    approvals: {} as never,
    trust,
    digest,
    clock: { now: () => new Date("2026-11-13T09:00:00.000Z") },
  });
}

function recordWith(pins: Record<string, ConnectorPin>): TrustRecord {
  return {
    location,
    fingerprint: "hfp1:test",
    content: {},
    grantedAt: "2026-11-13T09:00:00.000Z",
    appVersion: "0.1.0",
    pins,
    origin: "cli",
  };
}

verifies("cli.listed-tool-approval", () => {
  describe("the address a connector's tools are approved at", () => {
    it("is the URL of an http connector", async () => {
      const address = await approvalFor(workspaceWith(mail)).addressOf("mail");

      expect(address).toMatchObject({ kind: "listed", server: { kind: "http" } });
    });

    it("holds the pin the trust record keeps for a stdio connector", async () => {
      const trust = { get: async () => recordWith({ notes: pin }) };

      const address = await approvalFor(workspaceWith(notes), trust).addressOf("notes");

      expect(address).toMatchObject({ kind: "listed", server: { kind: "stdio", pin } });
    });

    it("needs no approval for the tools Halonic reviewed", async () => {
      const address = await approvalFor(workspaceWith(folderOnly)).addressOf("mine");

      expect(address).toEqual({ kind: "reviewed" });
    });

    it("is none for a connector the workspace has no file for", async () => {
      const address = await approvalFor(workspaceWith(mail)).addressOf("other");

      expect(address.kind).toBe("unaddressable");
    });

    it("is none when the trust record can't be read, so its tools wait", async () => {
      const trust = {
        get: async () => {
          throw new Error("damaged");
        },
      };

      const address = await approvalFor(workspaceWith(notes), trust).addressOf("notes");

      expect(address).toEqual({
        kind: "unaddressable",
        reason: "couldn't read the workspace's trust record",
      });
    });
  });

  describe("the debug line", () => {
    it("names the tools and the command, once for each set of them", () => {
      const lines: Phrase[] = [];
      const report = waitingReporter((line) => lines.push(line));
      const waiting = [{ source: "mail", name: "lookup" }];

      report("mail", waiting);
      report("mail", waiting);
      report("mail", [...waiting, { source: "mail", name: "send" }]);

      expect(lines).toHaveLength(2);
      expect(plainText(lines[0] as Phrase)).toContain("halonic tools review mail");
      expect(plainText(lines[0] as Phrase)).toContain("lookup");
      expect(plainText(lines[1] as Phrase)).toContain("lookup, send");
    });
  });
});
