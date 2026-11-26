import { fixedClock, type Sha256 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ApprovalRead } from "./approval-read.ts";
import { toCard } from "./card.ts";
import { normaliseForKeywords } from "./keyword.ts";
import { effectiveNeverList, type NeverListRevision } from "./loosen.ts";
import { type NeverList, readNeverList, seedEntries } from "./never-list.ts";
import { screenCard } from "./screen.ts";

const workspaceId = "company-1";

const digest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** A never-list document with these entry lines under `entries:`. */
function document(entryLines: string[], extra = ""): string {
  return [
    "version: 2",
    `workspaceId: ${workspaceId}`,
    "connectorUserId: user-viewer",
    entryLines.length === 0 ? "entries: []" : "entries:",
    ...entryLines,
    extra,
  ].join("\n");
}

function read(text: string): NeverList {
  const result = readNeverList(text, { workspaceId });
  if (!result.ok) throw new Error(`expected a list, got ${result.reason}`);
  return result.list;
}

/** A pending, untouched approval of `type` with `payload`, asked by agent-1. */
async function cardFor(type: string, payload: unknown = {}) {
  const approval: ApprovalRead = {
    approval: {
      id: "approval-1",
      companyId: workspaceId,
      type,
      status: "pending",
      requestedByAgentId: "agent-1",
      decidedByUserId: null,
      payload,
      createdAt: "2026-11-26T08:00:00.000Z",
      updatedAt: "2026-11-26T08:00:00.000Z",
    },
    activity: [
      {
        action: "approval.created",
        actorType: "agent",
        actorId: "agent-1",
        entityId: "approval-1",
        createdAt: "2026-11-26T08:00:00.000Z",
      },
    ],
    comments: [],
    linkedIssues: [],
    readAt: "2026-11-26T09:00:00.000Z",
  };
  const result = await toCard(approval, workspaceId, digest);
  if (!result.ok) throw new Error(result.reason);
  return result.card;
}

function reasonsFor(card: Awaited<ReturnType<typeof cardFor>>, list: NeverList) {
  const screening = screenCard(card, list);
  return screening.eligible ? [] : screening.reasons;
}

verifies("auto-approvals.never-list", () => {
  describe("readNeverList", () => {
    it("reads entries and holds, with the seed floor added", () => {
      const list = read(
        document(
          ["  - kind: path_class", "    value: core"],
          "holds:\n  - name: DEPLOY-HOLD\n    covers: all",
        ),
      );
      expect(list.entries[0]).toEqual({ kind: "path_class", value: "core" });
      expect(list.entries).toEqual(expect.arrayContaining([...seedEntries]));
      expect(list.holds).toEqual([{ name: "DEPLOY-HOLD", covers: "all" }]);
    });

    it("fails closed on a typo in a value", () => {
      const text = document(["  - kind: approval_type", "    value: hire_agnet"]);
      expect(readNeverList(text, { workspaceId })).toEqual({
        ok: false,
        reason: "never_list.unknown_value",
      });
    });

    it.each([
      [
        "an unknown kind",
        document(["  - kind: approval_typ", "    value: hire_agent"]),
        "never_list.unknown_kind",
      ],
      ["an unknown field", document([], "updatedBy: someone"), "never_list.unknown_field"],
      [
        "another version",
        document([]).replace("version: 2", "version: 1"),
        "never_list.wrong_version",
      ],
      [
        "another workspace",
        document([]).replace(workspaceId, "company-2"),
        "never_list.wrong_workspace",
      ],
      [
        "no entries",
        "version: 2\nworkspaceId: company-1\nconnectorUserId: u",
        "never_list.missing_field",
      ],
      [
        "a hold over an unknown type",
        document([], "holds:\n  - name: H\n    covers: [hire_agnet]"),
        "never_list.unknown_value",
      ],
      [
        "a hold that covers nothing",
        document([], "holds:\n  - name: H\n    covers: []"),
        "never_list.bad_hold",
      ],
      [
        "an empty keyword",
        document(["  - kind: keyword", '    value: "\u200b"']),
        "never_list.unknown_value",
      ],
      ["text that isn't YAML", "entries: [", "never_list.unparsable"],
    ])("fails closed on %s", (_name, text, reason) => {
      expect(readNeverList(text, { workspaceId })).toEqual({ ok: false, reason });
    });

    it("still blocks a seed entry the document removes", async () => {
      const list = read(document([]));
      expect(reasonsFor(await cardFor("hire_agent"), list)).toContain("never_list.approval_type");
      expect(
        reasonsFor(await cardFor("request_board_approval", { source: "tool_gateway" }), list),
      ).toContain("never_list.approval_source");
    });
  });

  describe("keywords", () => {
    it("catches a keyword written in full-width or with hidden characters", async () => {
      expect(normaliseForKeywords("ＳＥＣ\u200bＲＥＴ")).toBe("secret");
      const list = read(document([]));
      const card = await cardFor("request_board_approval", {
        note: "rotate the ｓｅｃｒｅｔ please",
      });
      expect(reasonsFor(card, list)).toContain("never_list.keyword");
    });
  });

  describe("holds", () => {
    it("blocks every type a hold covers, and only those", async () => {
      const list = read(
        document([], "holds:\n  - name: FREEZE\n    covers: [request_board_approval]"),
      );
      expect(reasonsFor(await cardFor("request_board_approval"), list)).toContain(
        "never_list.hold",
      );
      expect(reasonsFor(await cardFor("hire_agent"), list)).not.toContain("never_list.hold");
    });
  });

  describe("effectiveNeverList", () => {
    const tightened = read(
      document(
        ["  - kind: path_class", "    value: core"],
        "holds:\n  - name: FREEZE\n    covers: all",
      ),
    );
    const loosened = read(document([]));
    const revisions: NeverListRevision[] = [
      { createdAt: "2026-11-25T10:00:00.000Z", list: tightened },
      { createdAt: "2026-11-26T10:00:00.000Z", list: loosened },
    ];
    const at = (time: string) => effectiveNeverList(revisions, fixedClock(Date.parse(time)).now());

    it("keeps a removed entry and hold until 24 hours have passed", () => {
      const before = at("2026-11-27T09:59:00.000Z");
      expect(before.entries).toContainEqual({ kind: "path_class", value: "core" });
      expect(before.holds).toEqual([{ name: "FREEZE", covers: "all" }]);
      const after = at("2026-11-27T10:00:00.000Z");
      expect(after.entries).not.toContainEqual({ kind: "path_class", value: "core" });
      expect(after.holds).toEqual([]);
    });

    it("applies an addition at once", () => {
      const added = effectiveNeverList(
        [
          { createdAt: "2026-11-25T10:00:00.000Z", list: loosened },
          { createdAt: "2026-11-26T10:00:00.000Z", list: tightened },
        ],
        new Date("2026-11-26T10:00:00.000Z"),
      );
      expect(added.entries).toContainEqual({ kind: "path_class", value: "core" });
      expect(added.holds).toHaveLength(1);
    });

    it("needs at least one revision", () => {
      expect(() => effectiveNeverList([], new Date())).toThrow();
    });
  });
});
