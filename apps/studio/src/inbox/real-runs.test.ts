import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FolderRunStore } from "@halonicjs/adapter-fs-node";
import { MemoryBlobStore } from "@halonicjs/adapter-memory";
import { inboxDecisions, inboxItems, inboxSignal } from "@halonicjs/studio-feature-inbox/api";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { publishCall, realEngine, replyStart, textAnswer } from "./real-runs.test-helper.ts";

/** A real run of the reply workflow, stopped at its `publish` call, and the Inbox's view of it. */
async function runAtPublish(
  after: Parameters<typeof realEngine>[0],
  stores?: Parameters<typeof realEngine>[1],
) {
  const engine = realEngine([publishCall, ...after], stores);
  const { id } = await engine.executor.start(replyStart);
  await engine.settle(id);
  const items = inboxItems(await engine.waiting());
  return { ...engine, runId: id, items, decisions: inboxDecisions(engine.executor) };
}

const folders: string[] = [];

afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

verifies("studio.inbox-real-runs", () => {
  it("shows a real run's call that needs your OK as one item, and counts it", async () => {
    const { items, published, runId } = await runAtPublish([]);

    expect(published).toEqual([]);
    expect(items).toMatchObject([
      { kind: "approval", runId, tool: "publish", connector: null, args: { title: "Your refund" } },
    ]);
    expect(inboxSignal(items)).toEqual({ mark: "count", value: 1, spoken: "1 waiting" });
  });

  it("runs the tool when you approve, then shows the review step with the filled-in reply", async () => {
    const run = await runAtPublish([textAnswer("Your refund is on its way.")]);
    const [item] = run.items;
    if (item === undefined) throw new Error("No item for the publish call.");

    await run.decisions.approve(item);
    await run.settle(run.runId);

    expect(run.published).toEqual([{ title: "Your refund" }]);
    expect(run.toolResults(1)).toEqual(["published"]);
    const review = inboxItems(await run.waiting());
    expect(review).toMatchObject([
      {
        kind: "wait",
        state: "review",
        title: "Approve this reply?",
        body: "Your refund is on its way.",
      },
    ]);
    expect(inboxSignal(review).value).toBe(1);
  });

  it("passes a rejection with your note back to the agent, and runs nothing", async () => {
    const run = await runAtPublish([textAnswer("Not published.")]);
    const [item] = run.items;
    if (item === undefined) throw new Error("No item for the publish call.");

    await run.decisions.askForChanges(item, "Not today");
    await run.settle(run.runId);

    expect(run.published).toEqual([]);
    expect(run.toolResults(1)).toEqual([
      "Refused: a person rejected the call and wrote: Not today",
    ]);
    expect(inboxItems(await run.waiting())).toMatchObject([
      { kind: "wait", body: "Not published." },
    ]);
  });

  it("keeps the run waiting, with its item, while nobody answers", async () => {
    const run = await runAtPublish([]);

    const day = 24 * 60 * 60 * 1_000;
    for (let days = 0; days < 30; days += 1) await run.passTime(day);

    expect(await run.stores.store.get(run.runId)).toMatchObject({ status: "waiting" });
    expect(inboxItems(await run.waiting())).toEqual(run.items);
    expect(run.published).toEqual([]);
  });

  it("still runs the tool when you approve after the engine started again", async () => {
    const folder = await mkdtemp(join(tmpdir(), "halonic-inbox-"));
    folders.push(folder);
    const stores = { store: new FolderRunStore(folder), blobs: new MemoryBlobStore() };
    const before = await runAtPublish([], stores);

    const after = realEngine([textAnswer("Your refund is on its way.")], {
      store: new FolderRunStore(folder),
      blobs: stores.blobs,
    });
    const [item] = inboxItems(await after.waiting());
    if (item === undefined) throw new Error("No item after the restart.");
    expect(item).toEqual(before.items[0]);

    await inboxDecisions(after.executor).approve(item);
    await after.settle(before.runId);

    expect(after.published).toEqual([{ title: "Your refund" }]);
    expect(before.published).toEqual([]);
  });
});
