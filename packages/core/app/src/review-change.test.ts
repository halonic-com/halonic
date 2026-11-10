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

const path = "hubs/p/agents/triage.agent.yaml";
const k1 = { chatId: "c1", cardId: "k1" };

const before = "# Sorts new tickets.\nname: Triage\nmodel: small # cheap is fine\n";
const byAssistant = "# Sorts new tickets.\nname: Ticket triage\nmodel: large # cheap is fine\n";

/** An agent where the assistant changed the name and the model: two changes on the item page. */
async function withTwoChanges() {
  const store = new TestDefinitionStore({ [path]: before }, digest);
  const recordStore = new TestDefinitionStore({}, digest);
  const review = new ReviewService({ store, records: recordStore, digest, isTrusted: () => true });
  await review.propose({
    path,
    content: byAssistant,
    expected: await contentDigest(before, digest),
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

verifies("app.review-accept-reject-change", () => {
  it("accepts one change into the baseline and leaves the file alone", async () => {
    const { store, review, changes } = await withTwoChanges();
    const { seen } = await changes();
    const outcome = await review.accept({ kind: "change", path, parts: [["model"]], seen });
    expect(outcome).toMatchObject({ status: "done", held: [] });
    expect(store.files.get(path)).toBe(byAssistant);
    expect((await changes()).baseline).toBe(
      "# Sorts new tickets.\nname: Triage\nmodel: large # cheap is fine\n",
    );
  });

  it("rejects one change by setting the baseline's value back, keeping the comments", async () => {
    const { store, review, changes } = await withTwoChanges();
    const { seen } = await changes();
    await review.reject({ kind: "change", path, parts: [["model"]], seen });
    expect(store.files.get(path)).toBe(
      "# Sorts new tickets.\nname: Ticket triage\nmodel: small # cheap is fine\n",
    );
    expect((await changes()).parts).toHaveLength(1);
  });

  it("removes the record with the last change, and undoes a change as one step", async () => {
    const { store, review, changes } = await withTwoChanges();
    await review.accept({ kind: "change", path, parts: [["name"]], seen: (await changes()).seen });
    const last = await review.reject({
      kind: "change",
      path,
      parts: [["model"]],
      seen: (await changes()).seen,
    });
    expect(await review.changesIn(path)).toBeNull();
    expect(store.files.get(path)).toBe(
      "# Sorts new tickets.\nname: Ticket triage\nmodel: small # cheap is fine\n",
    );
    if (last.status !== "done") {
      throw new Error(`not done: ${last.status}`);
    }
    await review.restore(last.step, "before");
    expect(store.files.get(path)).toBe(byAssistant);
    expect((await changes()).parts).toHaveLength(1);
  });

  it("is stale when the file changed since the change was shown", async () => {
    const { store, review, changes } = await withTwoChanges();
    const { seen } = await changes();
    await review.reject({ kind: "change", path, parts: [["name"]], seen });
    const outcome = await review.accept({ kind: "change", path, parts: [["model"]], seen });
    expect(outcome).toEqual({ status: "stale", path });
    expect(store.files.get(path)).toBe(
      "# Sorts new tickets.\nname: Triage\nmodel: large # cheap is fine\n",
    );
  });

  it("can't decide a change on its own in a file the assistant created", async () => {
    const store = new TestDefinitionStore({}, digest);
    const review = new ReviewService({
      store,
      records: new TestDefinitionStore({}, digest),
      digest,
      isTrusted: () => true,
    });
    await review.propose({ path, content: byAssistant, expected: "absent", card: k1 });
    const seen = (await review.changesIn(path))?.seen ?? "absent";
    const outcome = await review.accept({ kind: "change", path, parts: [["model"]], seen });
    expect(outcome).toMatchObject({ status: "cant-separate", path });
    expect(await review.itemsWithChangesToReview()).toEqual([{ path, card: k1 }]);
  });

  it("can't decide a change on its own when it has no parts", async () => {
    const { review, changes } = await withTwoChanges();
    const outcome = await review.reject({
      kind: "change",
      path,
      parts: [],
      seen: (await changes()).seen,
    });
    expect(outcome).toMatchObject({ status: "cant-separate", path });
  });

  it("can't decide a change on its own when the file doesn't read as YAML", async () => {
    const { store, review } = await withTwoChanges();
    // The assistant writes again, leaving the file broken.
    await review.propose({
      path,
      content: "name: [Ticket triage\n",
      expected: await contentDigest(byAssistant, digest),
      card: k1,
    });
    const seen = (await review.changesIn(path))?.seen ?? "absent";
    const outcome = await review.reject({ kind: "change", path, parts: [["name"]], seen });
    expect(outcome).toMatchObject({ status: "cant-separate", path });
    expect(store.files.get(path)).toBe("name: [Ticket triage\n");
  });

  it("holds the file when it changed outside Halonic since it was last seen", async () => {
    const { store, review } = await withTwoChanges();
    const outside = "# Sorts new tickets.\nname: Outside\nmodel: large # cheap is fine\n";
    store.files.set(path, outside);
    const outcome = await review.reject({
      kind: "change",
      path,
      parts: [["model"]],
      seen: await contentDigest(outside, digest),
    });
    expect(outcome).toEqual({ status: "done", step: { files: [] }, held: [path] });
    expect(store.files.get(path)).toBe(outside);
  });
});
