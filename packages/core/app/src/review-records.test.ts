import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  parseReviewRecord,
  type ReviewRecord,
  reviewRecordPath,
  serializeReviewRecord,
} from "./review-record.ts";
import { ReviewRecords } from "./review-records.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerk: ReviewRecord = {
  path: "agents/clerk.agent.yaml",
  baseline: "name: Clerk\nmodel: fast\n",
  card: { chatId: "c1", cardId: "k1" },
  seen: `sha256:${"a".repeat(64)}`,
};

const notes: ReviewRecord = { ...clerk, path: "agents/notes.agent.yaml", baseline: null };

/** The record's JSON with some fields replaced, as a hand edit would leave it. */
function editedRecord(changes: Record<string, unknown>): string {
  return JSON.stringify({ ...JSON.parse(serializeReviewRecord(clerk)), ...changes });
}

function setUp(files: Record<string, string> = {}) {
  const store = new TestDefinitionStore(files);
  return { store, records: new ReviewRecords(store, digest) };
}

verifies("app.review-record", () => {
  describe("keeping a record", () => {
    it("saves it under the SHA-256 of its path and reads the same record back", async () => {
      const { store, records } = setUp();
      await records.save(clerk);
      expect([...store.files.keys()]).toEqual([
        // SHA-256 of "agents/clerk.agent.yaml"; a record name never changes, or records would be lost.
        "b62cc1248570a14992f451b8a21c641ca5a130095603dc48b2362b6b3c9fa231.json",
      ]);
      expect(await records.read(clerk.path)).toEqual({ status: "found", record: clerk });
    });

    it("gives a file `a` and a file in a folder `a.json` different records", async () => {
      const { records } = setUp();
      await records.save({ ...clerk, path: "a" });
      await records.save({ ...clerk, path: "a.json/b" });
      expect((await records.all()).records.map((record) => record.path)).toEqual(["a", "a.json/b"]);
    });

    it("keeps a new file's missing baseline and a deleted file's trash entry", async () => {
      const { records } = setUp();
      const deleted: ReviewRecord = { ...clerk, seen: "absent", trashed: { trashId: "t-1" } };
      await records.save(notes);
      await records.save(deleted);
      expect(await records.read(notes.path)).toEqual({ status: "found", record: notes });
      expect(await records.read(deleted.path)).toEqual({ status: "found", record: deleted });
    });

    it("says there is none for a file without one, and removing it twice is fine", async () => {
      const { records } = setUp();
      expect(await records.read(clerk.path)).toEqual({ status: "none" });
      await records.save(clerk);
      await records.remove(clerk.path);
      await records.remove(clerk.path);
      expect(await records.read(clerk.path)).toEqual({ status: "none" });
    });

    it("refuses a record for Halonic's own data", async () => {
      const { records } = setUp();
      await expect(records.save({ ...clerk, path: ".halonic/review/x.yaml" })).rejects.toThrow(
        RangeError,
      );
      await expect(reviewRecordPath("hubs/p/.halonic/source.json", digest)).rejects.toThrow(
        RangeError,
      );
    });
  });

  describe("a record that can't be read", () => {
    it.each([
      ["broken JSON", '{"format":1,', "it isn't valid JSON"],
      ["a list", "[]", "it isn't a JSON object"],
      ["another format", editedRecord({ format: 2 }), "its format isn't 1"],
      ["an unsafe path", editedRecord({ path: "../x" }), "its path isn't a workspace file"],
      [
        "a path in .halonic",
        editedRecord({ path: ".halonic/x" }),
        "its path isn't a workspace file",
      ],
      ["a numeric baseline", editedRecord({ baseline: 3 }), "its baseline isn't text or null"],
      ["no card", editedRecord({ card: undefined }), "its card has no chatId and cardId"],
      [
        "an empty card id",
        editedRecord({ card: { chatId: "c1", cardId: "" } }),
        "its card has no chatId and cardId",
      ],
      [
        "a short digest",
        editedRecord({ seen: "sha256:abc" }),
        "its seen digest isn't a sha256 digest or absent",
      ],
      ["an empty trash entry", editedRecord({ trashed: {} }), "its trashed entry has no trashId"],
    ])("counts %s as unreadable", async (_name, text, reason) => {
      expect(parseReviewRecord(text)).toEqual({ ok: false, error: reason });
    });

    it("counts a record under another file's name as unreadable", async () => {
      const { records } = setUp({
        [await reviewRecordPath(clerk.path, digest)]: serializeReviewRecord(notes),
      });
      expect(await records.read(clerk.path)).toEqual({
        status: "unreadable",
        reason: 'it is about "agents/notes.agent.yaml", which has another record name',
      });
    });

    it("is removed and reported when the records are listed, and the others are listed", async () => {
      const broken = `${"0".repeat(64)}.json`;
      const misplaced = `${"1".repeat(64)}.json`;
      const { store, records } = setUp({
        [broken]: '{"format":1,',
        [misplaced]: serializeReviewRecord(clerk),
        [await reviewRecordPath(notes.path, digest)]: serializeReviewRecord(notes),
        README: "a stray file",
        [`old/${"2".repeat(64)}.json`]: "in a folder",
      });
      expect(await records.all()).toEqual({
        records: [notes],
        dropped: [
          { path: null, reason: "it isn't valid JSON" },
          {
            path: null,
            reason: 'it is about "agents/clerk.agent.yaml", which has another record name',
          },
        ],
      });
      expect(store.files.has(broken)).toBe(false);
      expect(store.files.has(misplaced)).toBe(false);
      expect(store.files.has("README")).toBe(true);
      expect(store.files.has(`old/${"2".repeat(64)}.json`)).toBe(true);
    });

    it("is removed too when only some files are read, which skips files without a record", async () => {
      const recordFile = await reviewRecordPath(clerk.path, digest);
      const { store, records } = setUp({ [recordFile]: '{"format":1,' });
      const listed = await records.some([
        "agents/none.agent.yaml",
        clerk.path,
        clerk.path,
        ".halonic/x.json",
      ]);
      expect(listed).toEqual({
        records: [],
        dropped: [{ path: clerk.path, reason: "it isn't valid JSON" }],
      });
      expect(store.files.has(recordFile)).toBe(false);
    });
  });

  it("reads its own JSON back as written", () => {
    expect(parseReviewRecord(serializeReviewRecord(clerk))).toEqual({ ok: true, value: clerk });
  });
});
