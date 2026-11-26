// @vitest-environment jsdom

import { NarrowProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox, type InboxRuns } from "../inbox.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import type { InboxMotion } from "./list-motion.ts";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();

const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", at(10, 42))],
});
const review = waitingRun("r2", {
  lastWaitingAt: at(9, 0),
  waitingFor: { title: "Approve this reply?", body: "" },
});

/** Motions that make each change at once and record what played, as the kit's would. */
function spyMotion() {
  return {
    flip: vi.fn<InboxMotion["flip"]>(async (_list, change) => change()),
    enter: vi.fn<InboxMotion["enter"]>(async () => {}),
    swap: vi.fn<InboxMotion["swap"]>(async (_pane, show) => show()),
  };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openInbox(runs: InboxRuns, motion: InboxMotion, narrow = false) {
  const root = render(
    <NarrowProvider narrow={narrow}>
      <InboxView
        inbox={new Inbox(runs)}
        now={() => new Date(2026, 10, 8, 10, 43)}
        motion={motion}
      />
    </NarrowProvider>,
  );
  await settled();
  return root;
}

function rowIds(root: HTMLElement): (string | null)[] {
  return [...root.querySelectorAll('[role="grid"] tr')].map((row) =>
    row.getAttribute("data-row-id"),
  );
}

function cell(root: HTMLElement, index: number): HTMLElement {
  return root.querySelectorAll<HTMLElement>('[role="grid"] [role="gridcell"]')[
    index
  ] as HTMLElement;
}

verifies("inbox.list-motion", () => {
  describe("list changes (motion 6)", () => {
    it("glides the rows that stay and drops in the row that came", async () => {
      const runs = fakeRuns([review]);
      const motion = spyMotion();
      const root = await openInbox(runs.runs, motion);
      motion.enter.mockClear();

      await act(async () => runs.change([notes, review]));
      await settled();
      expect(rowIds(root)).toHaveLength(2);
      expect(motion.flip).toHaveBeenCalledWith(
        root.querySelector('[role="grid"] tbody'),
        expect.any(Function),
      );
      const dropped = motion.enter.mock.calls.map(([row, options]) => [
        row.getAttribute("data-row-id"),
        options,
      ]);
      expect(dropped).toEqual([[rowIds(root)[0], { move: "drop" }]]);
    });

    it("holds a change while a pointer is pressed on the list, and plays it once let go", async () => {
      const runs = fakeRuns([review]);
      const root = await openInbox(runs.runs, spyMotion());
      await act(async () => {
        cell(root, 0).dispatchEvent(new Event("pointerdown", { bubbles: true }));
      });
      await act(async () => runs.change([notes, review]));
      await settled();
      expect(rowIds(root)).toHaveLength(1);

      await act(async () => {
        window.dispatchEvent(new Event("pointerup"));
      });
      expect(rowIds(root)).toHaveLength(2);
    });
  });

  describe("switching panes (motion 2)", () => {
    it("slides the item in as it opens with one pane, and the list back with Back to Inbox", async () => {
      const motion = spyMotion();
      const root = await openInbox(fakeRuns([notes]).runs, motion, true);
      await act(async () => cell(root, 0).click());
      const itemPane = root.querySelector('[data-pane="item"]');
      expect(motion.swap).toHaveBeenLastCalledWith(itemPane, expect.any(Function), "in");
      expect(root.querySelector("section h2")).not.toBeNull();

      const back = root.querySelector<HTMLButtonElement>('button[aria-label="Back to Inbox"]');
      await act(async () => back?.click());
      const listPane = root.querySelector('[data-pane="list"]');
      expect(motion.swap).toHaveBeenLastCalledWith(listPane, expect.any(Function), "back");
      expect(root.querySelector("section h2")).toBeNull();
    });

    it("slides nothing with two panes side by side", async () => {
      const motion = spyMotion();
      const root = await openInbox(fakeRuns([notes]).runs, motion);
      await act(async () => cell(root, 0).click());
      expect(root.querySelector("section h2")).not.toBeNull();
      expect(motion.swap).not.toHaveBeenCalled();
    });
  });
});
