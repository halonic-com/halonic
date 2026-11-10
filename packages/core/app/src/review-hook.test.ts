import type { Digest } from "@halonicjs/ports";
import { contentDigest, diffLines } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ReviewRecords } from "./review-records.ts";
import { ReviewService } from "./review-service.ts";
import { ReviewingDefinitionStore } from "./reviewing-store.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const path = "hubs/p/workflows/triage.workflow.yaml";
const k1 = { chatId: "c1", cardId: "k1" };

/** Ten lines, `line 1` to `line 10`, with some of them replaced. */
function lines(replaced: Record<number, string> = {}): string {
  return Array.from(
    { length: 10 },
    (_, index) => `${replaced[index + 1] ?? `line ${index + 1}`}\n`,
  ).join("");
}

/** A workspace where the assistant changed line 3 of the workflow, and the store everyone else writes through. */
async function withAssistantChange() {
  const inner = new TestDefinitionStore({ [path]: lines() }, digest);
  const recordStore = new TestDefinitionStore({}, digest);
  const review = new ReviewService({
    store: inner,
    records: recordStore,
    digest,
    isTrusted: () => true,
  });
  const store = new ReviewingDefinitionStore(inner, review.writer);
  await review.propose({
    path,
    content: lines({ 3: "line 3 by the assistant" }),
    expected: await contentDigest(lines(), digest),
    card: k1,
  });
  const records = new ReviewRecords(recordStore, digest);
  const baseline = async () => {
    const read = await records.read(path);
    return read.status === "found" ? read.record.baseline : undefined;
  };
  return { inner, store, review, records, baseline };
}

verifies("app.review-other-writes-merge", () => {
  it("carries an edit elsewhere into the baseline, so only the assistant's change is left to review", async () => {
    const { inner, store, baseline } = await withAssistantChange();
    await store.write(path, lines({ 3: "line 3 by the assistant", 9: "line 9 by the person" }));
    expect(await baseline()).toBe(lines({ 9: "line 9 by the person" }));
    const changes = diffLines((await baseline()) ?? "", inner.files.get(path) ?? "");
    expect(changes).toHaveLength(1);
    expect(changes[0]?.beforeStart).toBe(2);
  });

  it("takes an edit inside the assistant's change as accepting it", async () => {
    const { store, review, baseline } = await withAssistantChange();
    await store.write(path, lines({ 3: "line 3 by the person" }));
    expect(await baseline()).toBeUndefined();
    expect(await review.itemsWithChangesToReview()).toEqual([]);
  });

  it("clears the changes Undo these changes writes back", async () => {
    const { store, review } = await withAssistantChange();
    await store.write(path, lines());
    expect(await review.itemsWithChangesToReview()).toEqual([]);
  });

  it("drops the record when the person deletes the file", async () => {
    const { store, review } = await withAssistantChange();
    await store.remove(path);
    expect(await review.itemsWithChangesToReview()).toEqual([]);
  });

  it("takes an edit to a file the assistant created as accepting all of it", async () => {
    const inner = new TestDefinitionStore({}, digest);
    const recordStore = new TestDefinitionStore({}, digest);
    const review = new ReviewService({
      store: inner,
      records: recordStore,
      digest,
      isTrusted: () => true,
    });
    const store = new ReviewingDefinitionStore(inner, review.writer);
    await review.propose({ path, content: "name: Triage\n", expected: "absent", card: k1 });
    await store.write(path, "name: Triage\nstates: {}\n");
    expect(await review.itemsWithChangesToReview()).toEqual([]);
  });

  it("leaves the record alone when the write doesn't happen", async () => {
    const { store, baseline } = await withAssistantChange();
    const result = await store.write(path, "other\n", {
      expected: await contentDigest("stale\n", digest),
    });
    expect(result.status).toBe("changed-on-disk");
    expect(await baseline()).toBe(lines());
  });

  it("leaves the record alone and keeps the file held when it changed outside Halonic first", async () => {
    const { inner, store, review, baseline } = await withAssistantChange();
    // Someone outside Halonic changes line 9 on disk, then the editor saves an edit to line 6.
    inner.files.set(path, lines({ 3: "line 3 by the assistant", 9: "line 9 outside" }));
    await store.write(
      path,
      lines({ 3: "line 3 by the assistant", 6: "line 6 by the person", 9: "line 9 outside" }),
    );
    expect(await baseline()).toBe(lines());
    const found = await review.changesIn(path);
    const outcome = await review.reject({
      kind: "part",
      path,
      part: 0,
      seen: found?.seen ?? "absent",
    });
    expect(outcome).toMatchObject({ status: "done", held: [path] });
    expect(inner.files.get(path)).toContain("line 9 outside");
  });

  it("leaves the record alone when the file to remove is already gone", async () => {
    const { inner, store, records, baseline } = await withAssistantChange();
    // As the assistant's delete leaves it: no file, the old text as the baseline.
    inner.files.delete(path);
    const read = await records.read(path);
    if (read.status !== "found") {
      throw new Error("no record");
    }
    await records.save({ ...read.record, baseline: lines(), seen: "absent" });
    await store.remove(path);
    expect(await baseline()).toBe(lines());
  });

  it("writes a file without a record as it is", async () => {
    const { inner, store } = await withAssistantChange();
    await store.write("agents/clerk.agent.yaml", "name: Clerk\n");
    await store.remove("agents/clerk.agent.yaml");
    expect(inner.files.has("agents/clerk.agent.yaml")).toBe(false);
  });

  it("runs a save and a Reject on the same file one after the other", async () => {
    const { inner, store, review } = await withAssistantChange();
    const saving = store.write(
      path,
      lines({ 3: "line 3 by the assistant", 9: "line 9 by the person" }),
    );
    const rejecting = review.reject({ kind: "file", path });
    await Promise.all([saving, rejecting]);
    // The save went first and moved the baseline, so the Reject keeps the person's line 9.
    expect(inner.files.get(path)).toBe(lines({ 9: "line 9 by the person" }));
    expect(await review.itemsWithChangesToReview()).toEqual([]);
  });

  it("tells listeners the baseline moved", async () => {
    const { store, review } = await withAssistantChange();
    const heard: (readonly string[])[] = [];
    review.onDidChange((paths) => heard.push(paths));
    await store.write(path, lines({ 3: "line 3 by the assistant", 9: "x" }));
    expect(heard).toEqual([[path]]);
  });
});
