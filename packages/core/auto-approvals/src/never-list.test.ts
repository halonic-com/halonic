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
    /** An owner's revision `number`, written at `time`. */
    function revision(number: number, text: string, time: number, ownerWritten = true) {
      return { text, revisionNumber: number, writtenAt: new Date(time), ownerWritten };
    }

    it("keeps blocking a seed entry the document removed", () => {
      const read = effectiveNeverList(
        [revision(1, emptyList, removedAt - 30 * loosenDelayMs)],
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
        revision(1, withDeployHold, removedAt - loosenDelayMs),
        revision(2, emptyList, removedAt),
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
          revision(1, emptyList, removedAt - loosenDelayMs * 3),
          revision(2, withKeyword, removedAt),
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
        revision(1, withKeyword, removedAt - minute),
        revision(2, "entries: [", removedAt),
        revision(3, emptyList, r3At),
      ];
      const at = (time: number) => effectiveNeverList(revisions, workspaceId, clockAt(time));
      const keyword = { kind: "keyword", value: "payee" };

      const justBefore = at(r3At + loosenDelayMs - minute);
      expect(justBefore.ok && justBefore.list.entries).toContainEqual(keyword);
      const onTheDot = at(r3At + loosenDelayMs);
      expect(onTheDot.ok && onTheDot.list.entries).not.toContainEqual(keyword);
    });

    it("orders revisions written in the same millisecond by their number, in any order", () => {
      // By text, the keyword revision sorts first, so ordering by time and text dropped it after 24 hours.
      const revisions = [revision(1, emptyList, removedAt), revision(2, withKeyword, removedAt)];
      const later = clockAt(removedAt + 2 * loosenDelayMs);
      const keyword = { kind: "keyword", value: "payee" };
      for (const listed of [revisions, [...revisions].reverse()]) {
        const read = effectiveNeverList(listed, workspaceId, later);
        expect(read.ok && read.list.entries).toContainEqual(keyword);
      }
    });

    it("ignores an older revision no owner wrote, for content and for timing", () => {
      const revisions = [
        revision(1, withKeyword, removedAt - loosenDelayMs),
        revision(2, emptyList, removedAt - loosenDelayMs, false),
        revision(3, withKeyword, removedAt - loosenDelayMs),
      ];
      const read = effectiveNeverList(revisions, workspaceId, clockAt(removedAt));
      expect(read.ok && read.list.entries).toContainEqual({ kind: "keyword", value: "payee" });
    });

    it("stops on its own when the newest revision isn't an owner's (A24)", () => {
      const revisions = [
        revision(1, withKeyword, removedAt - loosenDelayMs),
        revision(2, withKeyword, removedAt, false),
      ];
      expect(effectiveNeverList(revisions, workspaceId, clockAt(removedAt))).toEqual({
        ok: false,
        reason: "never_list.not_owner_latest",
      });
    });

    it.each([
      ["a time that isn't a date", [revision(1, withKeyword, Number.NaN)], "time"],
      [
        "a later revision dated before an earlier one",
        [revision(1, withKeyword, removedAt), revision(2, emptyList, removedAt - loosenDelayMs)],
        "time",
      ],
      [
        "a revision number used twice",
        [revision(1, withKeyword, removedAt), revision(1, emptyList, removedAt)],
        "number",
      ],
      ["a revision number of 0", [revision(0, withKeyword, removedAt)], "number"],
    ])("fails closed on %s", (_, revisions, broken) => {
      expect(effectiveNeverList(revisions, workspaceId, clockAt(removedAt))).toEqual({
        ok: false,
        reason: `never_list.bad_revision_${broken}`,
      });
    });

    it("fails closed when the newest revision doesn't read, or there is none", () => {
      const revisions = [
        revision(1, withHireAgent, removedAt - minute),
        revision(2, neverList("entries: 1\n"), removedAt),
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
