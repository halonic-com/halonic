import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { reviewRecordPath } from "./review-record.ts";
import { ReviewService } from "./review-service.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerk = "agents/clerk.agent.yaml";
const notes = "agents/notes.agent.yaml";
const k1 = { chatId: "c1", cardId: "k1" };
const k2 = { chatId: "c2", cardId: "k2" };

/** A workspace where the assistant changed `clerk` (card k1) and created `notes` (card k2). */
async function withChanges() {
  const store = new TestDefinitionStore({ [clerk]: "model: fast\n" }, digest);
  const review = new ReviewService({ store, digest });
  const expected = await contentDigest("model: fast\n", digest);
  await review.propose({ path: clerk, content: "model: smart\n", expected, card: k1 });
  await review.propose({ path: notes, content: "name: Notes\n", expected: "absent", card: k2 });
  return { store, review };
}

verifies("app.review-on-open", () => {
  it("finds nothing to hold when every file is as last seen", async () => {
    const { review } = await withChanges();
    expect(await review.check()).toEqual({ held: [], dropped: [] });
  });

  it("holds a file changed or removed outside Halonic, and leaves it and its record alone", async () => {
    const { store, review } = await withChanges();
    store.files.set(clerk, "model: other\n");
    store.files.delete(notes);
    expect(await review.check()).toEqual({ held: [clerk, notes], dropped: [] });
    expect(store.files.get(clerk)).toBe("model: other\n");
    expect((await review.itemsWithChangesToReview()).map((item) => item.path)).toEqual([
      clerk,
      notes,
    ]);
  });

  it("removes a record that can't be read, so that file's changes are ordinary ones", async () => {
    const { store, review } = await withChanges();
    store.files.set(reviewRecordPath(clerk), '{"format":1,');
    expect(await review.check()).toEqual({
      held: [],
      dropped: [{ path: clerk, reason: "it isn't valid JSON" }],
    });
    expect(store.files.get(clerk)).toBe("model: smart\n");
    expect(store.files.has(reviewRecordPath(clerk))).toBe(false);
  });

  it("checks only the files a watch batch names, and skips Halonic's own data", async () => {
    const { store, review } = await withChanges();
    store.files.set(clerk, "model: other\n");
    store.files.set(notes, "name: Changed\n");
    expect(
      await review.check([notes, "agents/none.agent.yaml", ".halonic/review/files/x.json"]),
    ).toEqual({
      held: [notes],
      dropped: [],
    });
  });
});

verifies("app.review-items-to-review", () => {
  it("lists the files with changes to review, sorted, with their cards", async () => {
    const { review } = await withChanges();
    expect(await review.itemsWithChangesToReview()).toEqual([
      { path: clerk, card: k1 },
      { path: notes, card: k2 },
    ]);
  });

  it("drops a file from the list once it is accepted", async () => {
    const { review } = await withChanges();
    await review.accept({ kind: "file", path: clerk });
    expect(await review.itemsWithChangesToReview()).toEqual([{ path: notes, card: k2 }]);
  });
});
