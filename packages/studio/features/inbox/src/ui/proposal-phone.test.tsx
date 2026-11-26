// @vitest-environment jsdom
import type { Decision, ProposedRecord, Settled } from "@halonicjs/app";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import type { RunProposalEntry } from "../proposal-items.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { buttons, press, proposal, shownText, wrote } from "./proposal-card.test-helper.tsx";
import { ProposalCard } from "./proposal-card.tsx";

afterEach(() => {
  unmountAll();
});

function fakeDecisions() {
  return {
    accept: vi.fn(async () => wrote("u1")),
    reject: vi.fn(async () => wrote("u2")),
    undo: vi.fn(async () => ({ leftAlone: [] as readonly string[], decidedAfter: false })),
    settle: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    compare: vi.fn(async () => ({
      saved: "mine\n",
      run: "the run's\n",
      canCombine: false,
      seen: "absent",
    })),
    choose: vi.fn(),
  } satisfies ProposalDecisions;
}

/** The proposal page on a phone, as the Inbox shows it. */
function openOnPhone(decisions: ProposalDecisions, changedSinceRun = false) {
  const item = proposal(
    changedSinceRun
      ? { files: [{ path: "notes/a.md", change: "modified", decision: "undecided" }], changes: 1 }
      : {},
  );
  return render(
    <PresentationProvider presentation="phone">
      <ToastStoreProvider store={createToastStore()}>
        <ProposalCard
          item={item}
          now={new Date(2026, 10, 12, 9, 0)}
          facts={{ hubId: "support", workflow: "Support triage", startedBy: "a schedule" }}
          decisions={decisions}
          onDecided={() => {}}
          readAgain={async () => {}}
          onOpenRun={() => {}}
        />
      </ToastStoreProvider>
    </PresentationProvider>,
  );
}

/** The bar under the changes: the section's last child, after its scrolling body. */
const footBar = (root: HTMLElement) => root.querySelector("section")?.lastElementChild;

/** Run `runId`'s proposal with one undecided file, settled when `settled` is given. */
function entry(runId: string, settled?: Settled): RunProposalEntry {
  const record: ProposedRecord = {
    state: "proposed",
    proposal: {
      runId,
      history: "off",
      base: null,
      ref: null,
      files: [{ path: "notes/a.md", change: "modified", base: { digest: "sha256:d1" } }],
      items: ["support-triage"],
    },
    finishedAt: "2026-11-22T08:00:00.000Z",
    decisions: { "notes/a.md": (settled === undefined ? "undecided" : "rejected") as Decision },
    ...(settled === undefined ? {} : { settled }),
  };
  return { record, run: undefined };
}

/** The Inbox on a phone with these open and done proposals, once its first load has settled. */
async function inboxOnPhone(open: readonly RunProposalEntry[], done: readonly RunProposalEntry[]) {
  const { runs } = fakeRuns([]);
  const inbox = new Inbox({
    ...runs,
    proposals: async () => open,
    doneProposals: async () => done,
  });
  const root = render(
    <PresentationProvider presentation="phone">
      <InboxView
        inbox={inbox}
        proposals={fakeDecisions()}
        now={() => new Date("2026-11-22T10:00:00.000Z")}
      />
    </PresentationProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

/** Opens the grid cell as Enter on it does. */
function openCell(cell: HTMLElement | undefined) {
  act(() => cell?.focus());
  act(() => {
    cell?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

/** Needs you's cells: every grid cell not under the Done heading. */
const needsYouCells = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[role="gridcell"]')].filter(
    (cell) => cell.closest("details") === null,
  );

const doneCells = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('details [role="grid"] [role="gridcell"]'),
];

/** The header over the open item: Back to Inbox, then, at its end, the item's place. */
const itemBar = (root: HTMLElement) => {
  const header = root
    .querySelector<HTMLButtonElement>('button[aria-label="Back to Inbox"]')
    ?.closest("header");
  return `Back to Inbox${header?.querySelector(":scope > p")?.textContent ?? ""}`;
};

verifies("inbox.proposal-phone", () => {
  describe("a proposal on a phone", () => {
    it("puts Accept all across the width with Reject all under it, in a bar under the changes", async () => {
      const decisions = fakeDecisions();
      const root = openOnPhone(decisions);

      expect(root.querySelector("header")?.querySelector("button")).toBeNull();
      const bar = footBar(root);
      const names = [...(bar?.querySelectorAll("button") ?? [])].map((b) => shownText(b));
      expect(names).toEqual(["Accept all", "Reject all"]);
      for (const button of bar?.querySelectorAll("button") ?? []) {
        expect(button.className).toContain("w-full");
        expect(button.className).toContain("min-h-touch");
      }

      await press(buttons(root, "Accept all")[0]);
      expect(decisions.accept).toHaveBeenCalledWith("run_mfx3k2a1_0001JD8Q", "all");
    });

    it("keeps Accept all once every open change changed after the run, since it opens Compare", async () => {
      const decisions = fakeDecisions();
      decisions.accept.mockResolvedValueOnce({ ...wrote("u1"), changedSinceRun: ["notes/a.md"] });
      const root = openOnPhone(decisions, true);
      await press(buttons(root, "Accept all")[0]);

      const names = [...(footBar(root)?.querySelectorAll("button") ?? [])].map((b) => shownText(b));
      expect(names).toEqual(["Accept all", "Reject all"]);
    });

    it("makes See run, Reject and Accept 48 px high", () => {
      const root = openOnPhone(fakeDecisions());
      const targets = [
        ...buttons(root, "See run 01JD8Q ›"),
        ...buttons(root, "Reject"),
        ...buttons(root, "Accept"),
      ];
      expect(targets).toHaveLength(5);
      for (const target of targets) expect(target.className).toContain("phone:hit-touch");
    });
  });

  describe("the bar over an open item on a phone", () => {
    it("says where a waiting item is among what waits", async () => {
      const root = await inboxOnPhone([entry("01JD8Q"), entry("01JD9R")], []);
      openCell(needsYouCells(root)[1]);
      expect(itemBar(root)).toBe("Back to Inbox2 of 2");
    });

    it("shows no place for a done proposal", async () => {
      const root = await inboxOnPhone(
        [entry("01JD8Q")],
        [entry("01JD7A", { at: "2026-11-21T09:00:00.000Z", why: "decided" })],
      );
      openCell(doneCells(root)[0]);
      expect(itemBar(root)).toBe("Back to Inbox");
    });
  });
});
