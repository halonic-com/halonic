import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { ProposalFile, ProposalItem } from "../proposal-items.ts";
import { inboxRow, lateCount, rowFor } from "../ui/inbox-row.tsx";
import {
  decidedSummary,
  decidedToast,
  proposalFacts,
  proposalMeta,
  proposalTitle,
} from "./proposal-text.ts";

const now = new Date("2026-11-12T12:00:00.000Z");

function proposal(fields: Partial<ProposalItem> = {}): ProposalItem {
  return {
    kind: "proposal",
    key: "proposal:run_mfx3k2a1_0001JD8Q",
    runId: "run_mfx3k2a1_0001JD8Q",
    changes: 3,
    items: ["support-triage"],
    itemNames: ["Support triage"],
    files: [],
    ending: "finished",
    since: "2026-11-12T10:00:00.000Z",
    ...fields,
  };
}

verifies("inbox.proposal-items", () => {
  it("names the run, its changes and the items they go to", () => {
    expect(proposalTitle(proposal())).toBe("Run 01JD8Q proposes 3 changes to Support triage");
    expect(proposalTitle(proposal({ changes: 1 }))).toBe(
      "Run 01JD8Q proposes 1 change to Support triage",
    );
    const three = proposal({ itemNames: ["Support triage", "Clerk", "Notes"] });
    expect(proposalTitle(three)).toBe("Run 01JD8Q proposes 3 changes to Support triage and 2 more");
  });

  it("says how and when the run ended", () => {
    expect(proposalMeta(proposal(), now)).toBe("Finished 2 h ago");
    expect(proposalMeta(proposal({ ending: "failed" }), now)).toBe("Failed 2 h ago");
    expect(proposalMeta(proposal({ ending: "stopped" }), now)).toBe("Stopped 2 h ago");
    expect(proposalMeta(proposal({ ending: null }), now)).toBe("Ended 2 h ago");
  });

  it("is never late, however long it has waited", () => {
    const old = proposal({ since: "2026-11-01T10:00:00.000Z" });
    expect(rowFor(old, now)).toMatchObject({
      title: proposalTitle(old),
      meta: "Finished 11 days ago",
    });
    expect(lateCount([old], [], now)).toBe(0);
  });
});

verifies("inbox.proposal-page", () => {
  const file = (decision: ProposalFile["decision"]): ProposalFile => ({
    path: "notes/a.md",
    change: "modified",
    decision,
  });

  it("says when the run ended, and only that without its facts", () => {
    expect(proposalFacts(proposal({ ending: "stopped" }), now, undefined)).toMatch(/^Stopped at /);
  });

  it("counts the changes in the toast", () => {
    expect(decidedToast("Accepted", 1, "run_mfx3k2a1_0001JD8Q")).toBe(
      "Accepted 1 change from run 01JD8Q",
    );
    expect(decidedToast("Rejected", 3, "run_mfx3k2a1_0001JD8Q")).toBe(
      "Rejected 3 changes from run 01JD8Q",
    );
  });

  it("says what the proposal came to, counting the files that can't be written", () => {
    const some = [file("accepted"), file("accepted"), file("not-applicable")];
    expect(decidedSummary(some)).toBe("Accepted 2 of 3 changes · 1 can't be written");
    expect(decidedSummary([file("accepted"), file("rejected")])).toBe("Accepted 1 of 2 changes");
    expect(decidedSummary([file("accepted"), file("accepted")])).toBe("Accepted 2 changes");
    expect(decidedSummary([file("rejected"), file("rejected")])).toBe("Rejected");
  });

  it("wraps a row's title, so the item a proposal changes isn't cut off", () => {
    expect(inboxRow(proposal(), now, undefined).wrapTitle).toBe(true);
  });
});
