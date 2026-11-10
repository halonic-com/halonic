import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ReviewRecords } from "./review-records.ts";
import { ReviewService } from "./review-service.ts";
import type { ReviewOutcome } from "./review-types.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestTrash } from "./testing/test-trash.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const old = "agents/old.agent.yaml";
const text = "name: Old\n";
const k1 = { chatId: "c1", cardId: "k1" };

/** A workspace with `old.agent.yaml`, a trash, and the assistant's delete of it. */
async function withDelete() {
  const store = new TestDefinitionStore({ [old]: text }, digest);
  const trash = new TestTrash(store, digest);
  const review = new ReviewService({ store, digest, trash });
  const outcome = await review.proposeDelete({
    path: old,
    expected: await contentDigest(text, digest),
    card: k1,
  });
  return { store, trash, review, outcome, records: new ReviewRecords(store, digest) };
}

function stepOf(outcome: ReviewOutcome) {
  if (outcome.status !== "done") {
    throw new Error("stale");
  }
  return outcome.step;
}

verifies("app.review-deletes-and-new-files", () => {
  it("moves the deleted file to the trash and records it, with no parts to review", async () => {
    const { store, trash, review, outcome, records } = await withDelete();
    expect(outcome.status).toBe("written");
    expect(store.files.has(old)).toBe(false);
    expect([...trash.entries.values()]).toEqual([{ path: old, content: text }]);
    expect(await records.read(old)).toEqual({
      status: "found",
      record: {
        path: old,
        baseline: text,
        card: k1,
        seen: "absent",
        trashed: { trashId: "trash-1" },
      },
    });
    const changes = await review.changesIn(old);
    expect(changes?.deleted).toBe(true);
    expect(changes?.parts).toEqual([]);
  });

  it("puts the file back from the trash on Reject", async () => {
    const { store, trash, review } = await withDelete();
    await review.reject({ kind: "file", path: old });
    expect(store.files.get(old)).toBe(text);
    expect(trash.entries.size).toBe(0);
    expect(await review.itemsWithChangesToReview()).toEqual([]);
  });

  it("leaves the file in the trash on Accept", async () => {
    const { store, trash, review } = await withDelete();
    await review.accept({ kind: "file", path: old });
    expect(store.files.has(old)).toBe(false);
    expect(trash.entries.size).toBe(1);
    expect(await review.itemsWithChangesToReview()).toEqual([]);
  });

  it("writes the baseline back when the assistant changed the file before deleting it", async () => {
    const store = new TestDefinitionStore({ [old]: text }, digest);
    const review = new ReviewService({ store, digest, trash: new TestTrash(store, digest) });
    await review.propose({
      path: old,
      content: "name: Changed\n",
      expected: await contentDigest(text, digest),
      card: k1,
    });
    await review.proposeDelete({
      path: old,
      expected: await contentDigest("name: Changed\n", digest),
      card: k1,
    });
    await review.reject({ kind: "file", path: old });
    expect(store.files.get(old)).toBe(text);
  });

  it("holds the file when something is at its path again, and overwrites nothing", async () => {
    const { store, review } = await withDelete();
    store.files.set(old, "made elsewhere\n");
    const outcome = await review.reject({ kind: "file", path: old });
    expect(outcome).toEqual({ status: "done", step: { files: [] }, held: [old] });
    expect(store.files.get(old)).toBe("made elsewhere\n");
  });

  it("rejects again after an undo, writing the baseline when the trash entry is gone", async () => {
    const { store, review } = await withDelete();
    const step = stepOf(await review.reject({ kind: "file", path: old }));
    await review.restore(step, "before");
    expect(store.files.has(old)).toBe(false);
    await review.reject({ kind: "file", path: old });
    expect(store.files.get(old)).toBe(text);
  });

  it("removes a file the assistant created on Reject, and Undo brings it back", async () => {
    const store = new TestDefinitionStore({}, digest);
    const review = new ReviewService({ store, digest });
    await review.propose({ path: old, content: text, expected: "absent", card: k1 });
    const step = stepOf(await review.reject({ kind: "file", path: old }));
    expect(store.files.has(old)).toBe(false);
    await review.restore(step, "before");
    expect(store.files.get(old)).toBe(text);
  });

  it("leaves nothing to review when the assistant deletes a file it created", async () => {
    const store = new TestDefinitionStore({}, digest);
    const trash = new TestTrash(store, digest);
    const review = new ReviewService({ store, digest, trash });
    await review.propose({ path: old, content: text, expected: "absent", card: k1 });
    await review.proposeDelete({
      path: old,
      expected: await contentDigest(text, digest),
      card: k1,
    });
    expect(await review.itemsWithChangesToReview()).toEqual([]);
    expect(trash.entries.size).toBe(1);
  });

  it("deletes nothing when the file isn't what the model read, or when there is no trash", async () => {
    const { review } = await withDelete();
    const store = new TestDefinitionStore({ [old]: text }, digest);
    const noTrash = new ReviewService({ store, digest });
    const expected = await contentDigest(text, digest);
    expect(await review.proposeDelete({ path: old, expected, card: k1 })).toEqual({
      status: "changed-on-disk",
      current: null,
    });
    await expect(noTrash.proposeDelete({ path: old, expected, card: k1 })).rejects.toThrow(
      "no trash",
    );
    expect(store.files.get(old)).toBe(text);
  });
});
