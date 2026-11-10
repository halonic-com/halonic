import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  parseReviewRecord,
  type ReviewRecord,
  reviewedPath,
  reviewRecordPath,
  serializeReviewRecord,
} from "./review-record.ts";
import { ReviewRecords } from "./review-records.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

const digestOfFile = `sha256:${"a".repeat(64)}`;

const clerk: ReviewRecord = {
  path: "agents/clerk.agent.yaml",
  baseline: "name: Clerk\nmodel: fast\n",
  card: { chatId: "c1", cardId: "k1" },
  seen: digestOfFile,
};

const recordFile = ".halonic/review/files/agents/clerk.agent.yaml.json";

/** The record's JSON with some fields replaced, as a hand edit would leave it. */
function editedRecord(changes: Record<string, unknown>): string {
  return JSON.stringify({ ...JSON.parse(serializeReviewRecord(clerk)), ...changes });
}

verifies("app.review-record", () => {
  describe("keeping a record", () => {
    it("saves it next to the other records and reads the same record back", async () => {
      const store = new TestDefinitionStore();
      const records = new ReviewRecords(store);
      await records.save(clerk);
      expect([...store.files.keys()]).toEqual([recordFile]);
      expect(await records.read(clerk.path)).toEqual({ status: "found", record: clerk });
    });

    it("keeps a new file's missing baseline and a deleted file's trash entry", async () => {
      const records = new ReviewRecords(new TestDefinitionStore());
      const created: ReviewRecord = { ...clerk, path: "agents/notes.agent.yaml", baseline: null };
      const deleted: ReviewRecord = { ...clerk, seen: "absent", trashed: { trashId: "t-1" } };
      await records.save(created);
      await records.save(deleted);
      expect(await records.read(created.path)).toEqual({ status: "found", record: created });
      expect(await records.read(deleted.path)).toEqual({ status: "found", record: deleted });
    });

    it("says there is none for a file without one, and removing it twice is fine", async () => {
      const records = new ReviewRecords(new TestDefinitionStore());
      expect(await records.read(clerk.path)).toEqual({ status: "none" });
      await records.save(clerk);
      await records.remove(clerk.path);
      await records.remove(clerk.path);
      expect(await records.read(clerk.path)).toEqual({ status: "none" });
    });

    it("refuses a record for Halonic's own data", async () => {
      const records = new ReviewRecords(new TestDefinitionStore());
      await expect(records.save({ ...clerk, path: ".halonic/review/x.yaml" })).rejects.toThrow(
        RangeError,
      );
      expect(() => reviewRecordPath("hubs/p/.halonic/source.json")).toThrow(RangeError);
    });
  });

  describe("a record that can't be read", () => {
    it.each([
      ["broken JSON", '{"format":1,', "it isn't valid JSON"],
      ["a list", "[]", "it isn't a JSON object"],
      ["another format", editedRecord({ format: 2 }), "its format isn't 1"],
      [
        "another path",
        editedRecord({ path: "agents/other.agent.yaml" }),
        'it is about "agents/other.agent.yaml", not "agents/clerk.agent.yaml"',
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
      const records = new ReviewRecords(new TestDefinitionStore({ [recordFile]: text }));
      expect(await records.read(clerk.path)).toEqual({ status: "unreadable", reason });
    });

    it("is removed and reported when the records are listed, and the others are listed", async () => {
      const notes: ReviewRecord = { ...clerk, path: "agents/notes.agent.yaml", baseline: null };
      const store = new TestDefinitionStore({
        [recordFile]: '{"format":1,',
        [reviewRecordPath(notes.path)]: serializeReviewRecord(notes),
        ".halonic/review/files/README": "a stray file",
      });
      const listed = await new ReviewRecords(store).all();
      expect(listed).toEqual({
        records: [notes],
        dropped: [{ path: clerk.path, reason: "it isn't valid JSON" }],
      });
      expect(store.files.has(recordFile)).toBe(false);
      expect(store.files.has(".halonic/review/files/README")).toBe(true);
    });
  });

  describe("record paths", () => {
    it("maps a record's place back to its file, and nothing else", () => {
      expect(reviewedPath(recordFile)).toBe(clerk.path);
      expect(reviewedPath(".halonic/review/files/.json")).toBeNull();
      expect(reviewedPath(".halonic/review/files/.halonic/x.json")).toBeNull();
      expect(reviewedPath(".halonic/review/other/a.yaml.json")).toBeNull();
      expect(reviewedPath(".halonic/review/files/a.yaml")).toBeNull();
    });

    it("reads its own JSON back as written", () => {
      expect(parseReviewRecord(serializeReviewRecord(clerk), clerk.path)).toEqual({
        ok: true,
        value: clerk,
      });
    });
  });
});
