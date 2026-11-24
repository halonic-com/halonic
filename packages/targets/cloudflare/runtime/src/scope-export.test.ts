import type { RunMetadata } from "@halonicjs/adapter-cloudflare-storage";
import { checkClaims, type Principal, parseScope, type Scope } from "@halonicjs/host-server";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  ExportRefusedError,
  type ExportViewer,
  exportScope,
  operatorActor,
  type ScopeExportSource,
} from "./scope-export.ts";

const organisation = "o/org_acme0123456789abcdef";
const ownerId = "eu_owner0123456789abcdef";
const adminId = "eu_admin0123456789abcdef";
const memberId = "eu_member0123456789abcde";

/** Run A, which a member started and kept private: its metadata may go to an admin, its events may not. */
const privateRun: RunMetadata = {
  id: "r-private",
  startedBy: memberId,
  visibility: "private",
  status: "completed",
  startedAt: "2026-11-05T07:00:00.000Z",
};
const privateText = "the member's private notes";

function scope(name: string): Scope {
  const parsed = parseScope(name);
  if (parsed === null) throw new Error(`The test's scope ${name} was refused.`);
  return parsed;
}

function principal(actor: string, scopeName: string, role: string): ExportViewer {
  const claims = scopeName.startsWith("u/")
    ? { aud: "app", sub: actor, scope: scopeName }
    : { aud: "app", sub: actor, scope: scopeName, role };
  const session = checkClaims(claims);
  if (session === null) throw new Error("The test's claims were refused.");
  return { principal: session.principal as Principal };
}

const source: ScopeExportSource = {
  records: { collections: async () => [], changes: async () => [] },
  runs: { list: async () => [{ id: privateRun.id }], metadata: async () => [privateRun] },
  runStore: {
    events: async (runId) =>
      [{ runId, seq: 1, at: privateRun.startedAt, type: "note", text: privateText }] as never,
  },
  blobs: { hashes: async () => [], get: async () => null },
};

const now = new Date("2026-11-24T06:00:00.000Z");

function exportFor(viewer: ExportViewer, scopeName = organisation) {
  return exportScope(source, scope(scopeName), viewer, "acme", now);
}

verifies("runtime.scope-export", () => {
  describe("a scope's export", () => {
    it("gives an organisation's owner every file, private runs included, naming the owner's id", async () => {
      const result = await exportFor(principal(ownerId, organisation, "owner"));
      expect(result.kind).toBe("full");
      expect(result.actor).toBe(ownerId);
      expect(result.kind === "full" && result.manifest.files.map((file) => file.path)).toEqual([
        "runs/r-private.jsonl",
      ]);
    });

    it("gives an organisation's admin the runs' metadata and none of their content", async () => {
      const result = await exportFor(principal(adminId, organisation, "admin"));
      expect(result).toEqual({ kind: "metadata", actor: adminId, runs: [privateRun] });
      expect(JSON.stringify(result)).not.toContain(privateText);
    });

    it("gives the operator every file, naming the operator", async () => {
      const result = await exportFor({ operator: true });
      expect(result.kind).toBe("full");
      expect(result.actor).toBe(operatorActor);
    });

    it("gives a person every file of their own scope", async () => {
      const own = `u/${ownerId}`;
      const result = await exportFor(principal(ownerId, own, "owner"), own);
      expect(result.kind).toBe("full");
      expect(result.actor).toBe(ownerId);
    });

    it("refuses a member, and a principal of another scope, before reading anything", async () => {
      const unread: ScopeExportSource = {
        ...source,
        runs: {
          list: async () => expect.unreachable("the runs were read"),
          metadata: async () => expect.unreachable("the metadata was read"),
        },
      };
      const member = principal(memberId, organisation, "member");
      const otherOwner = principal(ownerId, "o/org_acme0123456789abcdefb", "owner");
      for (const viewer of [member, otherOwner]) {
        await expect(exportScope(unread, scope(organisation), viewer, "acme", now)).rejects.toThrow(
          ExportRefusedError,
        );
      }
    });
  });
});
