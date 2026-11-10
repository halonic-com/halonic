import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ReviewRecords } from "./review-records.ts";
import { ReviewService } from "./review-service.ts";
import { ReviewingDefinitionStore } from "./reviewing-store.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestTrash } from "./testing/test-trash.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const path = "hubs/p/workflows/triage.workflow.yaml";
const k1 = { chatId: "c1", cardId: "k1" };
const byAssistant = "line 3 by the assistant";

/** Ten lines, `line 1` to `line 10`, with some of them replaced. */
function lines(replaced: Record<number, string> = {}): string {
  return Array.from(
    { length: 10 },
    (_, index) => `${replaced[index + 1] ?? `line ${index + 1}`}\n`,
  ).join("");
}

/**
 * A workspace where the assistant changed line 3 of the workflow. `inner`
 * is the folder as other programs change it; `store` is the one Halonic's
 * own saves go through.
 */
async function withAssistantChange(options: { trusted?: boolean } = {}) {
  const inner = new TestDefinitionStore({ [path]: lines() }, digest);
  const recordStore = new TestDefinitionStore({}, digest);
  const review = new ReviewService({
    store: inner,
    records: recordStore,
    digest,
    trash: new TestTrash(inner, digest),
    isTrusted: () => options.trusted ?? true,
  });
  await review.propose({
    path,
    content: lines({ 3: byAssistant }),
    expected: await contentDigest(lines(), digest),
    card: k1,
  });
  const records = new ReviewRecords(recordStore, digest);
  const record = async () => {
    const read = await records.read(path);
    return read.status === "found" ? read.record : null;
  };
  const store = new ReviewingDefinitionStore(inner, review.writer);
  return { inner, store, review, records, record };
}

/** Rejects the first change to review in the file, as its card's Reject button does. */
async function rejectFirstPart(review: ReviewService) {
  const found = await review.changesIn(path);
  return review.reject({ kind: "part", path, part: 0, seen: found?.seen ?? "absent" });
}

verifies("app.review-outside-changes-merge", () => {
  it("takes in a change elsewhere in the file, so only the assistant's is left to review", async () => {
    const { inner, review, record } = await withAssistantChange();
    const heard: (readonly string[])[] = [];
    review.onDidChange((paths) => heard.push(paths));
    inner.files.set(path, lines({ 3: byAssistant, 9: "line 9 in VS Code" }));

    expect(await review.check([path])).toEqual({ held: [], dropped: [] });
    expect((await record())?.baseline).toBe(lines({ 9: "line 9 in VS Code" }));
    expect(heard).toEqual([[path]]);
    expect((await review.changesIn(path))?.parts).toHaveLength(1);
    expect(await rejectFirstPart(review)).toMatchObject({ status: "done", held: [] });
    expect(inner.files.get(path)).toBe(lines({ 9: "line 9 in VS Code" }));
  });

  it("takes in a change on the line next to the assistant's", async () => {
    const { inner, review, record } = await withAssistantChange();
    inner.files.set(path, lines({ 3: byAssistant, 4: "line 4 in VS Code" }));
    expect(await review.check([path])).toEqual({ held: [], dropped: [] });
    expect((await record())?.baseline).toBe(lines({ 4: "line 4 in VS Code" }));
  });

  it("holds a change to the assistant's own line, and leaves the record as it is", async () => {
    const { inner, review, record } = await withAssistantChange();
    const before = await record();
    inner.files.set(path, lines({ 3: "line 3 from git pull" }));
    expect(await review.check([path])).toEqual({ held: [path], dropped: [] });
    expect(await record()).toEqual(before);
  });

  it("holds a file deleted outside Halonic", async () => {
    const { inner, review, record } = await withAssistantChange();
    const before = await record();
    inner.files.delete(path);
    expect(await review.check([path])).toEqual({ held: [path], dropped: [] });
    expect(await record()).toEqual(before);
  });

  it("holds a file the assistant created, whatever changed in it", async () => {
    const inner = new TestDefinitionStore({}, digest);
    const review = new ReviewService({
      store: inner,
      records: new TestDefinitionStore({}, digest),
      digest,
      isTrusted: () => true,
    });
    await review.propose({ path, content: "name: Triage\n", expected: "absent", card: k1 });
    inner.files.set(path, "name: Triage\nstates: {}\n");
    expect(await review.check([path])).toEqual({ held: [path], dropped: [] });
  });

  it("holds the file, as before, for a record that keeps no text as last seen", async () => {
    const { inner, review, records, record } = await withAssistantChange();
    const { seenText: _dropped, ...older } = (await record()) ?? fail("no record");
    await records.save(older);
    inner.files.set(path, lines({ 3: byAssistant, 9: "line 9 in VS Code" }));
    expect(await review.check([path])).toEqual({ held: [path], dropped: [] });
    expect(await record()).toEqual(older);
  });

  it("holds the file when the kept text doesn't match the digest", async () => {
    const { inner, review, records, record } = await withAssistantChange();
    await records.save({ ...((await record()) ?? fail("no record")), seenText: lines() });
    inner.files.set(path, lines({ 3: byAssistant, 9: "line 9 in VS Code" }));
    expect(await review.check([path])).toEqual({ held: [path], dropped: [] });
  });

  it("takes in a change outside Halonic before a person's save, so both go into the baseline", async () => {
    const { inner, store, review, record } = await withAssistantChange();
    inner.files.set(path, lines({ 3: byAssistant, 9: "line 9 outside" }));
    await store.write(
      path,
      lines({ 3: byAssistant, 6: "line 6 by the person", 9: "line 9 outside" }),
    );
    expect((await record())?.baseline).toBe(
      lines({ 6: "line 6 by the person", 9: "line 9 outside" }),
    );
    expect((await review.changesIn(path))?.parts).toHaveLength(1);
  });

  it("removes the record when an outside change undoes the assistant's, as an Accept or Reject would", async () => {
    const { inner, review, record } = await withAssistantChange();
    const heard: (readonly string[])[] = [];
    review.onDidChange((paths) => heard.push(paths));
    // `git checkout -- file` puts line 3 back.
    inner.files.set(path, lines());
    expect(await review.check([path])).toEqual({ held: [], dropped: [] });
    expect(await record()).toBeNull();
    expect(heard).toEqual([[path]]);
    expect(await review.itemsWithChangesToReview()).toEqual([]);
  });

  it("keeps the card and the untrusted mark when it takes a change in", async () => {
    const { inner, review, record } = await withAssistantChange({ trusted: false });
    inner.files.set(path, lines({ 3: byAssistant, 9: "line 9 in VS Code" }));
    await review.check([path]);
    expect(await record()).toMatchObject({
      card: k1,
      writtenUntrusted: true,
      baseline: lines({ 9: "line 9 in VS Code" }),
      seenText: lines({ 3: byAssistant, 9: "line 9 in VS Code" }),
    });
  });

  it("takes in a change outside Halonic before the assistant's next write", async () => {
    const { inner, review, record } = await withAssistantChange();
    const outside = lines({ 3: byAssistant, 9: "line 9 in VS Code" });
    inner.files.set(path, outside);
    const outcome = await review.propose({
      path,
      content: lines({ 3: "line 3 again", 9: "line 9 in VS Code" }),
      expected: await contentDigest(outside, digest),
      card: k1,
    });
    expect(outcome.status).toBe("written");
    expect((await record())?.baseline).toBe(lines({ 9: "line 9 in VS Code" }));
  });

  it("still holds the assistant's write when the outside change touches its line", async () => {
    const { inner, review } = await withAssistantChange();
    const outside = lines({ 3: "line 3 from git pull" });
    inner.files.set(path, outside);
    const outcome = await review.propose({
      path,
      content: lines({ 3: "line 3 again" }),
      expected: await contentDigest(outside, digest),
      card: k1,
    });
    expect(outcome).toEqual({ status: "held" });
    expect(inner.files.get(path)).toBe(outside);
  });

  it("takes in a change outside Halonic before the assistant deletes the file", async () => {
    const { inner, review, record } = await withAssistantChange();
    const outside = lines({ 3: byAssistant, 9: "line 9 in VS Code" });
    inner.files.set(path, outside);
    const outcome = await review.proposeDelete({
      path,
      expected: await contentDigest(outside, digest),
      card: k1,
    });
    expect(outcome.status).toBe("written");
    // The trash holds the file with the assistant's line, not the baseline,
    // so Reject writes the baseline back instead of restoring from there.
    const after = await record();
    expect(after).toMatchObject({ baseline: lines({ 9: "line 9 in VS Code" }), seen: "absent" });
    expect(after).not.toHaveProperty("trashed");
    expect(after).not.toHaveProperty("seenText");
  });
});

function fail(message: string): never {
  throw new Error(message);
}
