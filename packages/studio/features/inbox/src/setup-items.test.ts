import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeRuns } from "./fake-runs.test-helper.ts";
import { fakeSetups, setupEntry } from "./fake-setups.test-helper.ts";
import { Inbox } from "./inbox.ts";
import { inboxItems } from "./inbox-items.ts";
import { pendingApproval, waitingRun } from "./test-runs.test-helper.ts";

const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", "2026-11-10T12:00:00.000Z")],
});

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

verifies("inbox.setup-items", () => {
  it("makes one item per account, keyed by provider and account ref", async () => {
    const google = fakeSetups("google", [setupEntry("acct-1", "2026-11-10T10:00:00.000Z")]);
    const inbox = new Inbox(fakeRuns([]).runs);
    inbox.addSetupSource(google.source);
    await settled();

    expect(inbox.state.items).toEqual([
      {
        kind: "setup",
        key: "setup:google:acct-1",
        provider: "google",
        account: "acct-1",
        title: "Set up Google for x@example.com",
        progress: "Step 4 of 7 · Scopes",
        changedAt: "2026-11-10T10:00:00.000Z",
      },
    ]);
  });

  it("puts setup items first, most recently changed first, and counts them", async () => {
    const google = fakeSetups("google", [
      setupEntry("acct-1", "2026-11-10T10:00:00.000Z"),
      setupEntry("acct-2", "2026-11-10T11:00:00.000Z"),
    ]);
    const inbox = new Inbox(fakeRuns([notes]).runs);
    inbox.addSetupSource(google.source);
    await settled();

    expect(inbox.state.items.map((item) => item.key)).toEqual([
      "setup:google:acct-2",
      "setup:google:acct-1",
      "r1:call-1",
    ]);
    expect(inbox.signal()).toEqual({ mark: "count", value: 3, spoken: "3 waiting" });
    // The items made from runs alone have none, so a list of runs that need you doesn't count them.
    expect(inboxItems([notes]).map((item) => item.kind)).toEqual(["approval"]);
  });

  it("loads again when the source changes", async () => {
    const google = fakeSetups("google", [setupEntry("acct-1", "2026-11-10T10:00:00.000Z")]);
    const inbox = new Inbox(fakeRuns([]).runs);
    inbox.addSetupSource(google.source);
    await settled();

    google.change([
      setupEntry("acct-1", "2026-11-10T10:05:00.000Z", { progress: "Step 5 of 7 · Test users" }),
    ]);
    await settled();
    expect(inbox.state.items[0]).toMatchObject({ progress: "Step 5 of 7 · Test users" });
  });

  it("drops a source's items and stops watching it once it's taken out", async () => {
    const google = fakeSetups("google", [setupEntry("acct-1", "2026-11-10T10:00:00.000Z")]);
    const inbox = new Inbox(fakeRuns([]).runs);
    const remove = inbox.addSetupSource(google.source);
    await settled();
    expect(inbox.state.items).toHaveLength(1);

    remove();
    await settled();
    expect(inbox.state.items).toEqual([]);
    expect(google.listeners.size).toBe(0);
  });

  it("stops watching its sources when the workspace closes", async () => {
    const google = fakeSetups("google", []);
    const inbox = new Inbox(fakeRuns([]).runs);
    inbox.addSetupSource(google.source);
    inbox.dispose();
    expect(google.listeners.size).toBe(0);
    // A source added after that is never watched.
    inbox.addSetupSource(google.source);
    expect(google.listeners.size).toBe(0);
  });

  it("keeps a failing source's last items, says why, and still updates the other sources", async () => {
    const google = fakeSetups("google", [setupEntry("acct-1", "2026-11-10T10:00:00.000Z")]);
    const other = fakeSetups("other", [setupEntry("acct-9", "2026-11-10T09:00:00.000Z")]);
    const inbox = new Inbox(fakeRuns([]).runs);
    inbox.addSetupSource(google.source);
    inbox.addSetupSource(other.source);
    await settled();

    const failure = new Error("setup records unreadable");
    other.fail(failure);
    google.change([
      setupEntry("acct-1", "2026-11-10T10:00:00.000Z"),
      setupEntry("acct-2", "2026-11-10T11:00:00.000Z"),
    ]);
    await settled();
    expect(inbox.state.items.map((item) => item.key)).toEqual([
      "setup:google:acct-2",
      "setup:google:acct-1",
      "setup:other:acct-9",
    ]);
    expect(inbox.state.error).toBe(failure);

    other.answer();
    await inbox.refresh();
    expect(inbox.state.error).toBeUndefined();
  });

  it("lists a run that starts waiting while a source fails", async () => {
    const google = fakeSetups("google", []);
    const runs = fakeRuns([]);
    const inbox = new Inbox(runs.runs);
    inbox.addSetupSource(google.source);
    await settled();

    const failure = new Error("setup records unreadable");
    google.fail(failure);
    runs.change([notes]);
    await settled();
    expect(inbox.state.items.map((item) => item.key)).toEqual(["r1:call-1"]);
    expect(inbox.state.error).toBe(failure);
  });

  it("takes one source per provider, so no two items share a key", async () => {
    const google = fakeSetups("google", [setupEntry("acct-1", "2026-11-10T10:00:00.000Z")]);
    const second = fakeSetups("google", [setupEntry("acct-1", "2026-11-10T11:00:00.000Z")]);
    const inbox = new Inbox(fakeRuns([]).runs);
    inbox.addSetupSource(google.source);
    const remove = inbox.addSetupSource(second.source);
    await settled();

    expect(inbox.state.items.map((item) => item.key)).toEqual(["setup:google:acct-1"]);
    expect(second.listeners.size).toBe(0);
    remove();
    await settled();
    expect(inbox.state.items).toHaveLength(1);
  });
});
