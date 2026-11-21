import type { ProposedRecord } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import type { ShownPage } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeRuns } from "./fake-runs.test-helper.ts";
import { Inbox } from "./inbox.ts";
import type { InboxItem } from "./inbox-items.ts";
import { needsYouNewsKey, watchNeedsYou } from "./needs-you-news.ts";
import { waitingRun } from "./test-runs.test-helper.ts";

const asking = (id: string, title: string) => waitingRun(id, { waitingFor: { title, body: "" } });
const r1 = asking("r1", "Send it?");
const r2 = asking("r2", "Pay the bill?");
const r3 = asking("r3", "Approve this reply?");
const r4 = asking("r4", "Book the room?");
const workflowPage = { kind: "workflow", hub: "acme", id: "support-reply" };

const title = (item: InboxItem) => (item.kind === "wait" ? item.title : item.key);

/** A proposal of run `runId` with one undecided file. */
function proposalOf(runId: string): ProposedRecord {
  const path = "notes/a.md";
  return {
    state: "proposed",
    proposal: {
      runId,
      history: "off",
      base: null,
      ref: null,
      files: [{ path, change: "added", base: "absent" }],
      items: [],
    },
    finishedAt: "2026-11-10T09:00:00.000Z",
    decisions: { [path]: "undecided" },
  };
}

/** An Inbox with these runs waiting, loaded, and a watcher on it that notes what it says. */
async function watched(
  initial: readonly RunSummary[],
  page: ShownPage = { place: "agents" },
  proposals: { runIds: readonly string[] } = { runIds: [] },
) {
  const runs = fakeRuns(initial);
  runs.runs.proposals = async () =>
    proposals.runIds.map((runId) => ({ record: proposalOf(runId), run: undefined }));
  const inbox = new Inbox(runs.runs);
  await inbox.refresh();
  const said: string[] = [];
  const clock = { ms: 0 };
  const shown = { page };
  watchNeedsYou(inbox, {
    shown: () => shown.page,
    title,
    say: (key, text) => {
      expect(key).toBe(needsYouNewsKey);
      said.push(text);
    },
    now: () => clock.ms,
  });
  const change = async (next: readonly RunSummary[]) => {
    runs.change(next);
    await inbox.refresh();
  };
  return { inbox, said, clock, shown, change, proposals };
}

verifies("inbox.needs-you-news", () => {
  it("says the new item's title and the count when Needs you goes up outside the Inbox", async () => {
    const { said, change } = await watched([r1, r2]);

    await change([r1, r2, r3]);

    expect(said).toEqual(["Waiting for you: Approve this reply?. 3 waiting."]);
  });

  it("says items within 2 s together, and starts again after 2 s", async () => {
    const { said, clock, change } = await watched([r1]);

    await change([r1, r2]);
    clock.ms = 1999;
    await change([r1, r2, r3]);
    clock.ms = 3999;
    await change([r1, r2, r3, r4]);

    expect(said).toEqual([
      "Waiting for you: Pay the bill?. 2 waiting.",
      "2 new in Needs you. 3 waiting.",
      "Waiting for you: Book the room?. 4 waiting.",
    ]);
  });

  it("says nothing while the Inbox shows", async () => {
    const { said, change } = await watched([r1], { place: "inbox" });

    await change([r1, r2]);

    expect(said).toEqual([]);
  });

  it("leaves out a run whose own page shows", async () => {
    const { said, change } = await watched([r1], {
      item: { kind: "run", hub: "acme", id: "r2" },
    });

    await change([r1, r2]);
    await change([r1, r2, r3]);

    expect(said).toEqual(["Waiting for you: Approve this reply?. 3 waiting."]);
  });

  it("says a proposal even while its run's own page shows: a page says only when a run waits", async () => {
    const { said, change, proposals } = await watched([r1], {
      item: { kind: "run", hub: "acme", id: "r2" },
    });

    proposals.runIds = ["r2"];
    await change([r1]);

    expect(said).toEqual(["Waiting for you: proposal:r2. 2 waiting."]);
  });

  it("leaves out a run a page noted, only while that page shows", async () => {
    const { inbox, said, clock, shown, change } = await watched([r1], { item: workflowPage });
    const stop = inbox.shownRuns.add("r2", workflowPage);
    inbox.shownRuns.add("r3", workflowPage);

    await change([r1, r2]);
    shown.page = { place: "home" };
    await change([r1, r2, r3]);
    stop();
    shown.page = { item: workflowPage };
    await change([r1, r3]);
    clock.ms = 5000;
    await change([r1, r2, r3]);

    expect(said).toEqual([
      "Waiting for you: Approve this reply?. 3 waiting.",
      "Waiting for you: Pay the bill?. 3 waiting.",
    ]);
  });

  it("says nothing for what waits at the first load, or a count that stays or drops", async () => {
    const runs = fakeRuns([r1, r2]);
    const inbox = new Inbox(runs.runs);
    const said: string[] = [];
    watchNeedsYou(inbox, { title, say: (_key, text) => said.push(text) });
    await inbox.refresh();

    runs.change([r1, r3]);
    await inbox.refresh();
    runs.change([r1]);
    await inbox.refresh();

    expect(said).toEqual([]);
  });
});
