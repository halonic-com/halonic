// @vitest-environment jsdom

import { settleHoldMs } from "@halonicjs/studio-kit/settle";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import type { InboxMotion } from "./list-motion.ts";

// Local times, so the test reads the same in every time zone. Tue 24 Nov 2026.
const asked = new Date(2026, 10, 24, 10, 0);

beforeEach(() => {
  // Only the timers: a read's own `setTimeout(0)` still runs, and the hold is skipped by hand.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pass(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await settled();
}

/** The motions, recorded, with the rows' change applied at once. */
function recordedMotion() {
  return {
    flip: vi.fn<InboxMotion["flip"]>(async (_list, change) => change()),
    enter: vi.fn<InboxMotion["enter"]>(async () => {}),
    swap: vi.fn<InboxMotion["swap"]>(async (_pane, show) => show()),
    leave: vi.fn<InboxMotion["leave"]>(async () => {}),
  };
}

/** Chief's open questions in "Paperclip · Acme", one per question, oldest first. */
function acme(...questions: string[]) {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const items = questions.map((question) =>
    // A person asks, so each card is its own row rather than one bundle of Chief's.
    messaging.addInboxItem(source.id, { question, from: { kind: "person", name: "Ada" } }),
  );
  return { messaging, items };
}

async function openInbox(messaging: FakeAgentMessaging) {
  const motion = recordedMotion();
  const announce = vi.fn<(line: string) => void>();
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([]).runs)}
      now={() => asked}
      agentMessaging={messaging}
      motion={motion}
      announce={announce}
    />,
  );
  await settled();
  return { root, motion, announce };
}

function rows(root: HTMLElement): HTMLTableRowElement[] {
  return [...root.querySelectorAll<HTMLTableRowElement>('[role="grid"] tr[data-row-id]')];
}

const texts = (root: HTMLElement) => rows(root).map((row) => row.textContent ?? "");

const heading = (root: HTMLElement) => root.querySelector('[role="grid"]')?.parentElement;

verifies("inbox.final-state", () => {
  describe("a row whose card ended while the Inbox showed it", () => {
    it("shows its final state in its place for 4 seconds, then fades, and the rows below glide up", async () => {
      const { messaging, items } = acme("Ship the release?", "Merge #12?");
      const { root, motion } = await openInbox(messaging);
      const [first] = items;
      if (first === undefined) throw new Error("no item");

      await act(async () => {
        messaging.answerElsewhere(
          first.id,
          { kind: "person", name: "Liam" },
          { kind: "option", option: "no" },
        );
      });
      await settled();

      expect(texts(root)).toEqual([
        expect.stringContaining("Ship the release?Answered by Liam · 10:00"),
        expect.stringContaining("Merge #12?"),
      ]);
      await pass(settleHoldMs - 100);
      expect(rows(root)).toHaveLength(2);
      expect(motion.leave).not.toHaveBeenCalled();

      await pass(100);
      expect(motion.leave).toHaveBeenCalledOnce();
      expect(motion.flip).toHaveBeenCalledOnce();
      expect(texts(root)).toEqual([expect.stringContaining("Merge #12?")]);
    });

    it("says Cancelled or Expired for a card that ended without an answer", async () => {
      const { messaging, items } = acme("Ship the release?", "Merge #12?");
      const { root } = await openInbox(messaging);
      const [first, second] = items;
      if (first === undefined || second === undefined) throw new Error("no items");

      await act(async () => messaging.closeElsewhere(first.id, "cancelled"));
      await settled();
      await act(async () => messaging.closeElsewhere(second.id, "expired"));
      await settled();

      expect(texts(root)).toEqual([
        expect.stringContaining("Expired · 10:00"),
        expect.stringContaining("Cancelled · 10:00"),
      ]);
    });

    it("can't be opened while it goes, and the counts go down at once, with no new left behind", async () => {
      const { messaging, items } = acme("Ship the release?");
      const { root } = await openInbox(messaging);
      const [first] = items;
      if (first === undefined) throw new Error("no item");
      expect(heading(root)?.textContent).toContain("1 new");

      await act(async () => messaging.closeElsewhere(first.id, "cancelled"));
      await settled();

      expect(heading(root)?.textContent).not.toContain("waiting");
      expect(heading(root)?.textContent).not.toContain("new");
      await act(async () =>
        rows(root)[0]?.querySelector<HTMLElement>('[role="gridcell"]')?.click(),
      );
      expect(root.querySelector("section h2")).toBeNull();
    });

    it("holds while the pointer is over it", async () => {
      const { messaging, items } = acme("Ship the release?");
      const { root } = await openInbox(messaging);
      const [first] = items;
      if (first === undefined) throw new Error("no item");

      await act(async () => messaging.closeElsewhere(first.id, "cancelled"));
      await settled();
      rows(root)[0]?.dispatchEvent(new Event("pointerenter"));
      await pass(settleHoldMs * 2);

      expect(texts(root)).toEqual([expect.stringContaining("Cancelled · 10:00")]);
    });

    it("reads one card out once, with its title", async () => {
      const { messaging, items } = acme("Ship the release?");
      const { announce } = await openInbox(messaging);
      const [first] = items;
      if (first === undefined) throw new Error("no item");

      await act(async () => messaging.closeElsewhere(first.id, "expired"));
      await settled();
      await pass(settleHoldMs);

      expect(announce.mock.calls).toEqual([["Ship the release?: Expired · 10:00"]]);
    });
  });

  describe("cards that ended in the same read", () => {
    it("hold and go together, in one motion, read out as one line", async () => {
      const { messaging, items } = acme("Ship the release?", "Merge #12?", "Tag 0.3.0?");
      const { root, motion, announce } = await openInbox(messaging);

      await act(async () => {
        for (const item of items) messaging.closeElsewhere(item.id, "cancelled");
      });
      await settled();
      expect(texts(root)).toEqual([
        expect.stringContaining("Cancelled · 10:00"),
        expect.stringContaining("Cancelled · 10:00"),
        expect.stringContaining("Cancelled · 10:00"),
      ]);
      rows(root)[0]?.dispatchEvent(new Event("pointerenter"));
      await pass(settleHoldMs * 2);
      expect(motion.leave).not.toHaveBeenCalled();

      rows(root)[0]?.dispatchEvent(new Event("pointerleave"));
      await pass(settleHoldMs);

      expect(motion.leave).toHaveBeenCalledTimes(3);
      expect(motion.flip).toHaveBeenCalledOnce();
      expect(rows(root)).toHaveLength(0);
      expect(announce.mock.calls).toEqual([["3 cards ended: Cancelled"]]);
    });

    it("say only how many when they ended in different ways", async () => {
      const { messaging, items } = acme("Ship the release?", "Merge #12?");
      const { announce } = await openInbox(messaging);
      const [first, second] = items;
      if (first === undefined || second === undefined) throw new Error("no items");

      await act(async () => {
        messaging.closeElsewhere(first.id, "cancelled");
        messaging.closeElsewhere(second.id, "expired");
      });
      await settled();

      expect(announce.mock.calls).toEqual([["2 cards ended"]]);
    });
  });
});
