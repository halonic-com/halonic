import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { findKeyword, normaliseClaim } from "./claims.ts";
import { effectiveNeverList, loosenDelayMs, seedEntries } from "./effective-list.ts";
import { neverListMaxLength, readNeverList } from "./never-list.ts";

const workspaceId = "acme-company";

function neverList(body: string): string {
  return `version: 2\nworkspaceId: ${workspaceId}\nconnectorUserId: acme-viewer\n${body}`;
}

const emptyList = neverList("entries: []\n");
const withHireAgent = neverList("entries:\n  - kind: approval_type\n    value: hire_agent\n");
const withDeployHold = neverList("entries: []\nholds:\n  - name: DEPLOY-HOLD\n    covers: all\n");
const withKeyword = neverList("entries:\n  - kind: keyword\n    value: payee\n");

const removedAt = Date.UTC(2026, 10, 26, 12);
const minute = 60 * 1000;

/** A clock that stays at one time, for judging the 24-hour delay. */
function clockAt(time: number) {
  return fixedClock(time, 0);
}

verifies("auto-approvals.never-list", () => {
  describe("readNeverList", () => {
    it("fails closed on a typo in a value", () => {
      const typo = neverList("entries:\n  - kind: approval_type\n    value: hire_agnet\n");
      expect(readNeverList(typo, workspaceId)).toEqual({
        ok: false,
        reason: "never_list.unknown_value",
      });
    });

    it.each([
      [
        "an unknown entry kind",
        "entries:\n  - kind: aproval_type\n    value: hire_agent\n",
        "never_list.unknown_kind",
      ],
      ["an unknown field", "entries: []\nnotes: x\n", "never_list.unknown_field"],
      [
        "an unknown field in an entry",
        "entries:\n  - kind: keyword\n    value: x\n    except: y\n",
        "never_list.unknown_field",
      ],
      [
        "an unknown kind in a hold",
        "entries: []\nholds:\n  - name: H\n    covers: [hire_agnet]\n",
        "never_list.unknown_value",
      ],
      [
        "a hold that covers nothing",
        "entries: []\nholds:\n  - name: H\n    covers: []\n",
        "never_list.bad_shape",
      ],
      ["entries that aren't a list", "entries: hire_agent\n", "never_list.bad_shape"],
      [
        "an empty keyword",
        'entries:\n  - kind: keyword\n    value: "\\u200b"\n',
        "never_list.bad_shape",
      ],
    ])("fails closed on %s", (_, body, reason) => {
      expect(readNeverList(neverList(body), workspaceId)).toEqual({ ok: false, reason });
    });

    it("fails closed on another workspace, another version or broken YAML", () => {
      expect(readNeverList(emptyList, "other-company")).toEqual({
        ok: false,
        reason: "never_list.wrong_workspace",
      });
      expect(readNeverList(emptyList.replace("version: 2", "version: 1"), workspaceId)).toEqual({
        ok: false,
        reason: "never_list.unsupported_version",
      });
      expect(readNeverList("entries: [", workspaceId)).toEqual({
        ok: false,
        reason: "never_list.unparsable",
      });
      expect(readNeverList("- a list\n", workspaceId)).toEqual({
        ok: false,
        reason: "never_list.bad_shape",
      });
      expect(readNeverList(`${emptyList}#${"x".repeat(neverListMaxLength)}`, workspaceId)).toEqual({
        ok: false,
        reason: "never_list.too_large",
      });
    });

    it("reads entries and holds", () => {
      const read = readNeverList(
        neverList(
          "entries:\n  - kind: path_class\n    value: security\nholds:\n  - name: FREEZE\n    covers: [hire_agent]\n",
        ),
        workspaceId,
      );
      expect(read).toEqual({
        ok: true,
        list: {
          workspaceId,
          connectorUserId: "acme-viewer",
          entries: [{ kind: "path_class", value: "security" }],
          holds: [{ name: "FREEZE", covers: ["hire_agent"] }],
        },
      });
    });
  });

  describe("connectorUserId", () => {
    const withoutConnector = `version: 2\nworkspaceId: ${workspaceId}\nentries: []\n`;

    it("may be left out, as in shadow mode", () => {
      expect(readNeverList(withoutConnector, workspaceId)).toEqual({
        ok: true,
        list: { workspaceId, entries: [], holds: [] },
      });
    });

    it.each([
      ["empty", 'connectorUserId: ""\n'],
      ["not text", "connectorUserId: [a]\n"],
    ])("fails closed when it is there but %s", (_, line) => {
      expect(readNeverList(`${withoutConnector}${line}`, workspaceId)).toEqual({
        ok: false,
        reason: "never_list.bad_shape",
      });
    });
  });

  describe("effectiveNeverList", () => {
    it("keeps blocking a seed entry the document removed", () => {
      const read = effectiveNeverList(
        [
          {
            text: emptyList,
            writtenAt: new Date(removedAt - 30 * loosenDelayMs),
            ownerWritten: true,
          },
        ],
        workspaceId,
        clockAt(removedAt),
      );
      expect(read.ok && read.list.entries).toContainEqual({
        kind: "approval_type",
        value: "hire_agent",
      });
      expect(read.ok && read.list.entries).toEqual(seedEntries);
    });

    it("applies a loosening edit only once 24 hours have passed", () => {
      const revisions = [
        {
          text: withDeployHold,
          writtenAt: new Date(removedAt - loosenDelayMs),
          ownerWritten: true,
        },
        { text: emptyList, writtenAt: new Date(removedAt), ownerWritten: true },
      ];
      const at = (offset: number) =>
        effectiveNeverList(revisions, workspaceId, clockAt(removedAt + offset));

      const justBefore = at(loosenDelayMs - minute);
      expect(justBefore.ok && justBefore.list.holds).toEqual([
        { name: "DEPLOY-HOLD", covers: "all" },
      ]);
      const onTheDot = at(loosenDelayMs);
      expect(onTheDot.ok && onTheDot.list.holds).toEqual([]);
    });

    it("applies an added entry at once", () => {
      const read = effectiveNeverList(
        [
          {
            text: emptyList,
            writtenAt: new Date(removedAt - loosenDelayMs * 3),
            ownerWritten: true,
          },
          { text: withKeyword, writtenAt: new Date(removedAt), ownerWritten: true },
        ],
        workspaceId,
        clockAt(removedAt),
      );
      expect(read.ok && read.list.entries).toContainEqual({ kind: "keyword", value: "payee" });
    });

    it("can't speed up a removal by writing a broken revision in between", () => {
      // R1 has the keyword, R2 doesn't read, R3 drops the keyword 23 hours after R2.
      const r3At = removedAt + 23 * 60 * minute;
      const revisions = [
        { text: withKeyword, writtenAt: new Date(removedAt - minute), ownerWritten: true },
        { text: "entries: [", writtenAt: new Date(removedAt), ownerWritten: true },
        { text: emptyList, writtenAt: new Date(r3At), ownerWritten: true },
      ];
      const at = (time: number) => effectiveNeverList(revisions, workspaceId, clockAt(time));
      const keyword = { kind: "keyword", value: "payee" };

      const justBefore = at(r3At + loosenDelayMs - minute);
      expect(justBefore.ok && justBefore.list.entries).toContainEqual(keyword);
      const onTheDot = at(r3At + loosenDelayMs);
      expect(onTheDot.ok && onTheDot.list.entries).not.toContainEqual(keyword);
    });

    it("reads revisions written at the same time the same way, in any order", () => {
      const revisions = [
        { text: withKeyword, writtenAt: new Date(removedAt), ownerWritten: true },
        { text: emptyList, writtenAt: new Date(removedAt), ownerWritten: true },
      ];
      const later = clockAt(removedAt + 2 * loosenDelayMs);
      expect(effectiveNeverList(revisions, workspaceId, later)).toEqual(
        effectiveNeverList([...revisions].reverse(), workspaceId, later),
      );
    });

    it("ignores a revision no owner wrote, for content and for timing", () => {
      const revisions = [
        { text: withKeyword, writtenAt: new Date(removedAt - loosenDelayMs), ownerWritten: true },
        { text: emptyList, writtenAt: new Date(removedAt - loosenDelayMs), ownerWritten: false },
      ];
      const read = effectiveNeverList(revisions, workspaceId, clockAt(removedAt));
      expect(read.ok && read.list.entries).toContainEqual({ kind: "keyword", value: "payee" });
    });

    it("fails closed when the newest revision doesn't read, or there is none", () => {
      const revisions = [
        { text: withHireAgent, writtenAt: new Date(removedAt - minute), ownerWritten: true },
        { text: neverList("entries: 1\n"), writtenAt: new Date(removedAt), ownerWritten: true },
      ];
      expect(effectiveNeverList(revisions, workspaceId, clockAt(removedAt))).toEqual({
        ok: false,
        reason: "never_list.bad_shape",
      });
      expect(effectiveNeverList([], workspaceId, clockAt(removedAt))).toEqual({
        ok: false,
        reason: "never_list.missing",
      });
    });
  });

  describe("keywords", () => {
    it.each([
      ["full-width", "ＳＥＣＲＥＴ"],
      ["mathematical bold", "𝐬𝐞𝐜𝐫𝐞𝐭"],
      ["split by a zero-width space", "se\u200bcret"],
      ["split by a variation selector", "se\ufe0fcret"],
      ["split by a combining grapheme joiner", "se\u034fcret"],
      ["circled", "ⓢⓔⓒⓡⓔⓣ"],
    ])("catches a %s keyword", (_, written) => {
      expect(findKeyword([`please rotate the ${written} today`], ["secret"])).toBe("secret");
    });

    it("finds nothing in unrelated text", () => {
      expect(findKeyword(["rename the docs page"], ["secret"])).toBeUndefined();
      expect(normaliseClaim("Ｓｅ\u200bｃｒｅｔ")).toBe("secret");
    });
  });
});
