import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { ProposalItem } from "../proposal-items.ts";
import { lateCount, rowFor } from "../ui/inbox-row.tsx";
import { proposalMeta, proposalTitle } from "./proposal-text.ts";

const now = new Date("2026-11-12T12:00:00.000Z");

function proposal(fields: Partial<ProposalItem> = {}): ProposalItem {
  return {
    kind: "proposal",
    key: "proposal:run_mfx3k2a1_0001JD8Q",
    runId: "run_mfx3k2a1_0001JD8Q",
    changes: 3,
    items: ["support-triage"],
    itemNames: ["Support triage"],
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
    expect(lateCount([old], now)).toBe(0);
  });
});
