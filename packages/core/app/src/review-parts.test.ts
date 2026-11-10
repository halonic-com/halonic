import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ReviewService } from "./review-service.ts";
import type { FileReview } from "./review-types.ts";
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

const byAssistant = lines({ 3: "line 3 by the assistant", 8: "line 8 by the assistant" });

/** A workflow where the assistant changed lines 3 and 8: two parts. */
async function withTwoParts() {
  const store = new TestDefinitionStore({ [path]: lines() }, digest);
  const recordStore = new TestDefinitionStore({}, digest);
  const review = new ReviewService({ store, records: recordStore, digest, isTrusted: () => true });
  await review.propose({
    path,
    content: byAssistant,
    expected: await contentDigest(lines(), digest),
    card: k1,
  });
  const changes = async (): Promise<FileReview> => {
    const found = await review.changesIn(path);
    if (found === null) {
      throw new Error("no changes to review");
    }
    return found;
  };
  return { store, review, changes };
}

verifies("app.review-accept-reject-part", () => {
  it("accepts one part into the baseline and leaves the file alone", async () => {
    const { store, review, changes } = await withTwoParts();
    const { seen } = await changes();
    const outcome = await review.accept({ kind: "part", path, part: 0, seen });
    expect(outcome.status).toBe("done");
    expect(store.files.get(path)).toBe(byAssistant);
    const left = await changes();
    expect(left.baseline).toBe(lines({ 3: "line 3 by the assistant" }));
    expect(left.parts.map((part) => part.added)).toEqual([["line 8 by the assistant\n"]]);
  });

  it("rejects one part by writing the baseline's lines back, keeping the other", async () => {
    const { store, review, changes } = await withTwoParts();
    const { seen } = await changes();
    await review.reject({ kind: "part", path, part: 0, seen });
    expect(store.files.get(path)).toBe(lines({ 8: "line 8 by the assistant" }));
    expect((await changes()).parts).toHaveLength(1);
  });

  it("removes the record with the last part, and undoes a part as one step", async () => {
    const { store, review, changes } = await withTwoParts();
    const first = await review.reject({
      kind: "part",
      path,
      part: 1,
      seen: (await changes()).seen,
    });
    await review.reject({ kind: "part", path, part: 0, seen: (await changes()).seen });
    expect(store.files.get(path)).toBe(lines());
    expect(await review.changesIn(path)).toBeNull();
    if (first.status !== "done") {
      throw new Error("the first reject was stale");
    }
    expect(first.step.files[0]?.file).toEqual({
      before: byAssistant,
      after: lines({ 3: "line 3 by the assistant" }),
    });
  });

  it("does nothing and says stale when the file changed since the parts were shown", async () => {
    const { store, review, changes } = await withTwoParts();
    const { seen } = await changes();
    await review.reject({ kind: "part", path, part: 0, seen });
    expect(await review.accept({ kind: "part", path, part: 0, seen })).toEqual({
      status: "stale",
      path,
    });
    expect(
      await review.accept({ kind: "part", path, part: 5, seen: (await changes()).seen }),
    ).toEqual({
      status: "stale",
      path,
    });
    expect(store.files.get(path)).toBe(lines({ 8: "line 8 by the assistant" }));
  });

  it("holds a file changed outside Halonic instead of rejecting a part over it", async () => {
    const { store, review } = await withTwoParts();
    const outside = lines({
      1: "outside",
      3: "line 3 by the assistant",
      8: "line 8 by the assistant",
    });
    store.files.set(path, outside);
    const seen = await contentDigest(outside, digest);
    expect(await review.reject({ kind: "part", path, part: 0, seen })).toEqual({
      status: "done",
      step: { files: [] },
      held: [path],
    });
    expect(store.files.get(path)).toBe(outside);
  });

  it("removes a new file when its only part is rejected", async () => {
    const store = new TestDefinitionStore({}, digest);
    const recordStore = new TestDefinitionStore({}, digest);
    const review = new ReviewService({
      store,
      records: recordStore,
      digest,
      isTrusted: () => true,
    });
    await review.propose({ path, content: "name: Triage\n", expected: "absent", card: k1 });
    const found = await review.changesIn(path);
    if (found === null) {
      throw new Error("The new file has no changes to review.");
    }
    await review.reject({ kind: "part", path, part: 0, seen: found.seen });
    expect(store.files.has(path)).toBe(false);
    expect(await review.itemsWithChangesToReview()).toEqual([]);
  });
});

verifies("app.review-changes-in", () => {
  it("works the parts out from the editor's unsaved text when it's given", async () => {
    const { review, changes } = await withTwoParts();
    expect((await changes()).parts).toHaveLength(2);
    const typing = lines({
      3: "line 3 by the assistant",
      8: "line 8 by the assistant",
      10: "typing",
    });
    const found = await review.changesIn(path, typing);
    expect(found?.parts).toHaveLength(3);
    expect(found?.seen).toBe(await contentDigest(typing, digest));
  });

  it("gives nothing for a file without changes to review", async () => {
    const { review } = await withTwoParts();
    expect(await review.changesIn("agents/clerk.agent.yaml")).toBeNull();
  });

  it("gives each file of one card, for the chat card", async () => {
    const { review } = await withTwoParts();
    await review.propose({ path: "a.yaml", content: "a\n", expected: "absent", card: k1 });
    await review.propose({
      path: "b.yaml",
      content: "b\n",
      expected: "absent",
      card: { chatId: "c2", cardId: "k2" },
    });
    const forCard = await review.changesForCard(k1);
    expect(forCard.map((file) => [file.path, file.parts.length])).toEqual([
      ["a.yaml", 1],
      [path, 2],
    ]);
  });
});
