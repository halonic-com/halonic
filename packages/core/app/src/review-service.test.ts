import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { reviewRecordPath } from "./review-record.ts";
import { ReviewRecords } from "./review-records.ts";
import { ReviewService } from "./review-service.ts";
import type { ReviewOutcome } from "./review-types.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerk = "agents/clerk.agent.yaml";
const triage = "hubs/p/workflows/triage.workflow.yaml";
const fast = "name: Clerk\nmodel: fast\n";
const smart = "name: Clerk\nmodel: smart\n";
const k1 = { chatId: "c1", cardId: "k1" };

function setUp(files: Record<string, string> = { [clerk]: fast }) {
  const store = new TestDefinitionStore(files, digest);
  const recordStore = new TestDefinitionStore({}, digest);
  return {
    store,
    recordStore,
    review: new ReviewService({ store, records: recordStore, digest, isTrusted: () => true }),
    records: new ReviewRecords(recordStore, digest),
  };
}

const digestOf = (text: string) => contentDigest(text, digest);

/** The outcome of a decision that wasn't stale. */
function done(outcome: ReviewOutcome): Extract<ReviewOutcome, { status: "done" }> {
  if (outcome.status !== "done") {
    throw new Error(`expected a done outcome, got ${outcome.status}`);
  }
  return outcome;
}

verifies("app.review-assistant-writes", () => {
  it("writes the file and keeps the text from before as the baseline", async () => {
    const { store, review, records } = setUp();
    const outcome = await review.propose({
      path: clerk,
      content: smart,
      expected: await digestOf(fast),
      card: k1,
    });
    expect(outcome.status).toBe("written");
    expect(store.files.get(clerk)).toBe(smart);
    expect(await records.read(clerk)).toEqual({
      status: "found",
      record: {
        path: clerk,
        baseline: fast,
        card: k1,
        seen: await digestOf(smart),
        seenText: smart,
      },
    });
  });

  it("keeps the first baseline on a later write", async () => {
    const { review, records } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    const again = `${smart}temperature: 0.2\n`;
    await review.propose({
      path: clerk,
      content: again,
      expected: await digestOf(smart),
      card: k1,
    });
    const read = await records.read(clerk);
    expect(read.status === "found" && read.record.baseline).toBe(fast);
  });

  it("writes nothing and gives the current text when the file isn't what the model read", async () => {
    const { store, review, records } = setUp();
    const outcome = await review.propose({
      path: clerk,
      content: smart,
      expected: await digestOf("old"),
      card: k1,
    });
    expect(outcome).toEqual({ status: "changed-on-disk", current: fast });
    expect(store.files.get(clerk)).toBe(fast);
    expect(await records.read(clerk)).toEqual({ status: "none" });
  });

  it("holds a file that changed outside Halonic since its record was made", async () => {
    const { store, review } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    store.files.set(clerk, "changed elsewhere\n");
    const outcome = await review.propose({
      path: clerk,
      content: "x\n",
      expected: await digestOf("changed elsewhere\n"),
      card: k1,
    });
    expect(outcome).toEqual({ status: "held" });
    expect(store.files.get(clerk)).toBe("changed elsewhere\n");
  });

  it("gives a new file no baseline", async () => {
    const { review, records } = setUp({});
    await review.propose({ path: clerk, content: smart, expected: "absent", card: k1 });
    const read = await records.read(clerk);
    expect(read.status === "found" && read.record.baseline).toBeNull();
  });

  it("hands the file to a newer card and says which card it replaced", async () => {
    const { review, records } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    const k7 = { chatId: "c2", cardId: "k7" };
    const outcome = await review.propose({
      path: clerk,
      content: "x\n",
      expected: await digestOf(smart),
      card: k7,
    });
    expect(outcome.status === "written" && outcome.replaced).toEqual(k1);
    const read = await records.read(clerk);
    expect(read.status === "found" && read.record.card).toEqual(k7);
  });

  it("drops the record when the assistant writes the baseline back", async () => {
    const { review, records } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    await review.propose({ path: clerk, content: fast, expected: await digestOf(smart), card: k1 });
    expect(await records.read(clerk)).toEqual({ status: "none" });
  });
});

verifies("app.review-accept-reject-file", () => {
  it("accepts a file by dropping its record and leaving the file alone", async () => {
    const { store, review, records } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    const outcome = await review.accept({ kind: "file", path: clerk });
    expect(store.files.get(clerk)).toBe(smart);
    expect(await records.read(clerk)).toEqual({ status: "none" });
    expect(done(outcome).step.files[0]?.file).toBeUndefined();
    expect(done(outcome).held).toEqual([]);
  });

  it("rejects a file by writing the baseline back, and removes a file the assistant created", async () => {
    const { store, review, records } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    await review.propose({ path: triage, content: "name: Triage\n", expected: "absent", card: k1 });
    await review.reject({ kind: "file", path: clerk });
    await review.reject({ kind: "file", path: triage });
    expect(store.files.get(clerk)).toBe(fast);
    expect(store.files.has(triage)).toBe(false);
    expect((await records.all()).records).toEqual([]);
  });

  it("holds a file that changed outside Halonic instead of rejecting over it", async () => {
    const { store, review, records } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    store.files.set(clerk, "changed elsewhere\n");
    const outcome = await review.reject({ kind: "file", path: clerk });
    expect(outcome).toEqual({ status: "done", step: { files: [] }, held: [clerk] });
    expect(store.files.get(clerk)).toBe("changed elsewhere\n");
    expect((await records.read(clerk)).status).toBe("found");
  });

  it("undoes and redoes an accept, which only changed the record", async () => {
    const { store, review, records } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    const before = await records.read(clerk);
    const { step } = done(await review.accept({ kind: "file", path: clerk }));
    await review.restore(step, "before");
    expect(await records.read(clerk)).toEqual(before);
    expect(store.files.get(clerk)).toBe(smart);
    await review.restore(step, "after");
    expect(await records.read(clerk)).toEqual({ status: "none" });
  });

  it("doesn't bring an accepted record back over a file that changed since", async () => {
    const { store, review, records } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    const { step } = done(await review.accept({ kind: "file", path: clerk }));
    store.files.set(clerk, "typed since\n");
    expect(await review.restore(step, "before")).toEqual({
      status: "done",
      step: { files: [] },
      held: [clerk],
    });
    expect(await records.read(clerk)).toEqual({ status: "none" });
  });

  it("undoes a reject by putting the assistant's text and the record back", async () => {
    const { store, review, records } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    const before = await records.read(clerk);
    const { step } = done(await review.reject({ kind: "file", path: clerk }));
    const undone = await review.restore(step, "before");
    expect(store.files.get(clerk)).toBe(smart);
    expect(await records.read(clerk)).toEqual(before);
    expect(done(undone).step.files[0]?.file).toEqual({ before: fast, after: smart });
  });

  it("doesn't undo over a file that changed since the step", async () => {
    const { store, review } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    const { step } = done(await review.reject({ kind: "file", path: clerk }));
    store.files.set(clerk, "typed since\n");
    expect(await review.restore(step, "before")).toEqual({
      status: "done",
      step: { files: [] },
      held: [clerk],
    });
    expect(store.files.get(clerk)).toBe("typed since\n");
  });

  it("does nothing for a file without changes to review", async () => {
    const { review } = setUp();
    expect(await review.reject({ kind: "file", path: clerk })).toEqual({
      status: "done",
      step: { files: [] },
      held: [],
    });
  });
});

verifies("app.review-accept-reject-all", () => {
  it("rejects every file of one card as one step, and leaves other cards alone", async () => {
    const { store, review, records } = setUp({ [clerk]: fast, [triage]: "name: Triage\n" });
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    await review.propose({
      path: triage,
      content: "name: T\n",
      expected: await digestOf("name: Triage\n"),
      card: k1,
    });
    await review.propose({
      path: "a.yaml",
      content: "a\n",
      expected: "absent",
      card: { chatId: "c1", cardId: "k2" },
    });
    const { step } = done(await review.reject({ kind: "card", card: k1 }));
    expect(step.files.map((file) => file.path)).toEqual([clerk, triage]);
    expect(store.files.get(clerk)).toBe(fast);
    expect(store.files.get(triage)).toBe("name: Triage\n");
    expect((await records.all()).records.map((record) => record.path)).toEqual(["a.yaml"]);
    await review.restore(step, "before");
    expect(store.files.get(clerk)).toBe(smart);
    expect(store.files.get(triage)).toBe("name: T\n");
  });

  it("leaves a file alone that another card took over after the files were listed", async () => {
    const { store, review, records } = setUp();
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    const k7 = { chatId: "c2", cardId: "k7" };
    const expected = await digestOf(smart);
    // The reject lists k1's files first; the write for k7 is already queued
    // on the file, so it runs between that listing and the reject's turn.
    const rejecting = review.reject({ kind: "card", card: k1 });
    const writing = review.propose({
      path: clerk,
      content: "x\n",
      expected,
      card: k7,
    });
    const [rejected, written] = await Promise.all([rejecting, writing]);
    expect(written.status).toBe("written");
    expect(rejected).toEqual({ status: "done", step: { files: [] }, held: [] });
    expect(store.files.get(clerk)).toBe("x\n");
    const read = await records.read(clerk);
    expect(read.status === "found" && read.record.card).toEqual(k7);
  });

  it("accepts every file of one chat", async () => {
    const { store, recordStore, review, records } = setUp({});
    await review.propose({ path: "a.yaml", content: "a\n", expected: "absent", card: k1 });
    await review.propose({
      path: "b.yaml",
      content: "b\n",
      expected: "absent",
      card: { chatId: "c1", cardId: "k2" },
    });
    await review.propose({
      path: "c.yaml",
      content: "c\n",
      expected: "absent",
      card: { chatId: "c2", cardId: "k3" },
    });
    await review.accept({ kind: "chat", chatId: "c1" });
    expect((await records.all()).records.map((record) => record.path)).toEqual(["c.yaml"]);
    expect([...store.files.keys()]).toEqual(["a.yaml", "b.yaml", "c.yaml"]);
    expect(recordStore.files.has(await reviewRecordPath("c.yaml", digest))).toBe(true);
  });
});

verifies("app.review-accept-reject-file", () => {
  it("tells listeners which files' records changed, and only when one did", async () => {
    const { review } = setUp();
    const heard: (readonly string[])[] = [];
    const stop = review.onDidChange((paths) => heard.push(paths));
    await review.propose({ path: clerk, content: smart, expected: await digestOf(fast), card: k1 });
    const { step } = done(await review.accept({ kind: "file", path: clerk }));
    await review.restore(step, "before");
    await review.reject({ kind: "file", path: triage });
    stop();
    await review.accept({ kind: "file", path: clerk });
    expect(heard).toEqual([[clerk], [clerk], [clerk]]);
  });

  it("reports a listener's error without failing the change", async () => {
    const store = new TestDefinitionStore({ [clerk]: fast }, digest);
    const recordStore = new TestDefinitionStore({}, digest);
    const errors: unknown[] = [];
    const review = new ReviewService({
      store,
      records: recordStore,
      digest,
      isTrusted: () => true,
      onListenerError: (error) => errors.push(error),
    });
    review.onDidChange(() => {
      throw new Error("a faulty panel");
    });
    const outcome = await review.propose({
      path: clerk,
      content: smart,
      expected: await digestOf(fast),
      card: k1,
    });
    expect(outcome.status).toBe("written");
    expect(errors).toHaveLength(1);
  });
});
