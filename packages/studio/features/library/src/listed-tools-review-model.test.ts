import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type {
  ListedToolPick,
  ListedToolRow,
  ListedToolsApproval,
  ListedToolsHost,
  ListedToolsSnapshot,
} from "./listed-tools-host.ts";
import { ListedToolsReviewModel, shownTools } from "./listed-tools-review-model.ts";

function row(name: string, overrides: Partial<ListedToolRow> = {}): ListedToolRow {
  return {
    name,
    fingerprint: `htl1:${name}-1`,
    description: `Does ${name}.`,
    arguments: [],
    state: "not_approved",
    differences: [],
    serverChanged: false,
    leftOutArguments: [],
    ...overrides,
  };
}

function snapshot(overrides: Partial<ListedToolsSnapshot> = {}): ListedToolsSnapshot {
  return {
    sourceName: "Notes server",
    toReview: [row("search"), row("lookup")],
    keepsChanging: [],
    refused: [],
    approved: [],
    listingRefused: null,
    unreadable: null,
    hasApprovals: false,
    ...overrides,
  };
}

/** A host with a fixed answer that records what the model approved. */
class FakeHost implements ListedToolsHost {
  answer: ListedToolsSnapshot;
  approvals: ListedToolPick[][] = [];
  removals: string[] = [];
  changed: readonly string[] = [];
  failWith: Error | undefined;
  private listener: (() => void) | undefined;

  constructor(answer: ListedToolsSnapshot) {
    this.answer = answer;
  }

  async review(): Promise<ListedToolsSnapshot> {
    return this.answer;
  }

  async approve(_id: string, picks: readonly ListedToolPick[]): Promise<ListedToolsApproval> {
    if (this.failWith !== undefined) throw this.failWith;
    this.approvals.push([...picks]);
    const approved = picks.filter((pick) => !this.changed.includes(pick.name)).map((p) => p.name);
    this.answer = {
      ...this.answer,
      toReview: this.answer.toReview.filter((r) => !approved.includes(r.name)),
      keepsChanging: this.answer.keepsChanging.filter((r) => !approved.includes(r.name)),
      approved: [...this.answer.approved, ...approved],
    };
    return { approved, changed: this.changed };
  }

  async removeApproval(_id: string, toolName: string): Promise<void> {
    this.removals.push(toolName);
  }

  subscribe(listener: () => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  changeBehindTheScreen(): void {
    this.listener?.();
  }
}

async function opened(host: FakeHost): Promise<ListedToolsReviewModel> {
  const model = new ListedToolsReviewModel(host, "notes");
  model.subscribe(() => {});
  await model.refresh();
  return model;
}

verifies("library.listed-tools-review", () => {
  it("starts with nothing ticked and approves nothing without a tick", async () => {
    const host = new FakeHost(snapshot());
    const model = await opened(host);
    expect(model.state.ticked.size).toBe(0);
    expect(await model.approveSelected()).toEqual({ kind: "stay" });
    expect(model.state.approveError).toBe("Tick the tools you want to approve.");
    expect(host.approvals).toEqual([]);
  });

  it("approves the ticked tools at the version shown and closes with a toast that says what stays off", async () => {
    const host = new FakeHost(snapshot());
    const model = await opened(host);
    model.toggle("search");
    const outcome = await model.approveSelected();
    expect(host.approvals).toEqual([[{ name: "search", fingerprint: "htl1:search-1" }]]);
    expect(outcome).toEqual({
      kind: "close",
      toast: "Approved 1 tool from Notes server. 1 stays off.",
    });
  });

  it("approves all the tools the search shows, and no others", async () => {
    const host = new FakeHost(snapshot({ toReview: [row("search"), row("lookup"), row("sort")] }));
    const model = await opened(host);
    model.setSearch("SEAR");
    await model.approveAll();
    expect(host.approvals[0]?.map((pick) => pick.name)).toEqual(["search"]);
  });

  it("keeps a tick on a row the search hides, but does not approve it", async () => {
    const host = new FakeHost(snapshot());
    const model = await opened(host);
    model.toggle("lookup");
    model.setSearch("search");
    await model.approveSelected();
    expect(host.approvals).toEqual([]);
    expect(model.state.ticked.has("lookup")).toBe(true);
  });

  it("never approves a tool that keeps changing with Approve all, only by name on its own button", async () => {
    const changing = row("flaky");
    const host = new FakeHost(snapshot({ keepsChanging: [changing] }));
    const model = await opened(host);
    await model.approveAll();
    expect(host.approvals[0]?.map((pick) => pick.name)).toEqual(["search", "lookup"]);
    await model.approveThisVersion("flaky");
    expect(host.approvals[1]).toEqual([{ name: "flaky", fingerprint: "htl1:flaky-1" }]);
  });

  it("clears the tick and says so when a tool changed again before it was approved", async () => {
    const host = new FakeHost(snapshot());
    const model = await opened(host);
    model.toggle("search");
    host.answer = snapshot({
      toReview: [row("search", { fingerprint: "htl1:search-2" }), row("lookup")],
    });
    host.changeBehindTheScreen();
    await model.refresh();
    expect(model.state.changedAgain).toEqual(["search"]);
    expect(model.state.ticked.has("search")).toBe(false);
  });

  it("stays open and names the tool when the host found it at another version", async () => {
    const host = new FakeHost(snapshot());
    host.changed = ["search"];
    const model = await opened(host);
    model.toggle("search");
    expect(await model.approveSelected()).toEqual({ kind: "stay" });
    expect(model.state.changedAgain).toEqual(["search"]);
  });

  it("closes as none with a toast that counts the waiting tools, and says nothing when none wait", async () => {
    const model = await opened(new FakeHost(snapshot()));
    expect(model.approveNone()).toEqual({
      kind: "close",
      toast: "Nothing approved. 2 tools from Notes server stay off.",
    });
    const empty = await opened(new FakeHost(snapshot({ toReview: [] })));
    expect(empty.approveNone()).toEqual({ kind: "close", toast: null });
  });

  it("shows why approving failed and keeps the ticks so the person can try again", async () => {
    const host = new FakeHost(snapshot());
    host.failWith = new Error("The disk is full");
    const model = await opened(host);
    model.toggle("search");
    expect(await model.approveSelected()).toEqual({ kind: "stay" });
    expect(model.state.approveError).toContain("Couldn't approve the tools:");
    expect(model.state.ticked.has("search")).toBe(true);
    expect(model.state.busy).toBe(false);
  });

  it("removes an approval and returns the toast for when the screen closes", async () => {
    const host = new FakeHost(snapshot({ approved: ["lookup"] }));
    const model = await opened(host);
    expect(await model.removeApproval("lookup")).toBe(
      "Removed your approval for lookup. It's off until you approve it again.",
    );
    expect(host.removals).toEqual(["lookup"]);
  });

  describe("the search", () => {
    it("filters every group by name or description, refused ones by name or reason", () => {
      const all = snapshot({
        toReview: [row("search"), row("lookup", { description: "Finds a search term" })],
        keepsChanging: [row("flaky")],
        refused: [
          { name: "search it", reason: "breaks the name rule" },
          { name: "x", reason: "no" },
        ],
      });
      const shown = shownTools(all, "search");
      expect(shown.toReview.map((r) => r.name)).toEqual(["search", "lookup"]);
      expect(shown.keepsChanging).toEqual([]);
      expect(shown.refused.map((r) => r.name)).toEqual(["search it"]);
    });
  });
});

verifies("library.listed-tools-review-states", () => {
  it("keeps the review open on Approve this version while other tools wait", async () => {
    const model = await opened(new FakeHost(snapshot({ keepsChanging: [row("flaky")] })));
    expect(await model.approveThisVersion("flaky")).toEqual({ kind: "stay" });
    expect(model.state.snapshot?.approved).toEqual(["flaky"]);
  });

  it("closes with the toast on Approve this version once nothing is left to decide", async () => {
    const model = await opened(
      new FakeHost(snapshot({ toReview: [], keepsChanging: [row("flaky")] })),
    );
    expect(await model.approveThisVersion("flaky")).toEqual({
      kind: "close",
      toast: "Approved 1 tool from Notes server",
    });
  });
});
