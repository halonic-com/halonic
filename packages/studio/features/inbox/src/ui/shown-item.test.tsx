// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { reopenItem } from "../shown-item.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();

const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", at(10, 42))],
});
const review = waitingRun("r2", {
  lastWaitingAt: at(9, 0),
  waitingFor: { title: "Approve this reply?", body: "" },
});

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The key of the review item, as a loaded Inbox lists it. */
async function reviewKey(): Promise<string> {
  const inbox = new Inbox(fakeRuns([notes, review]).runs);
  await inbox.refresh();
  const key = inbox.state.items.find((item) => item.key.includes("r2"))?.key;
  inbox.dispose();
  if (key === undefined) throw new Error("no review item");
  return key;
}

verifies("inbox.window-item", () => {
  describe("reopenItem", () => {
    it("waits for the list, then opens the kept item while it is still in it", async () => {
      const key = await reviewKey();
      const inbox = new Inbox(fakeRuns([notes, review]).runs);
      const reopened = reopenItem(inbox, key);
      await inbox.refresh();

      expect(await reopened).toBe(true);
      const root = render(<InboxView inbox={inbox} />);
      await settled();
      expect(root.querySelector("section h2")?.textContent).toBe("Approve this reply?");
      expect(inbox.shownItem.key).toBe(key);
    });

    it("leaves the list showing when the kept item is gone", async () => {
      const key = await reviewKey();
      const inbox = new Inbox(fakeRuns([notes]).runs);
      await inbox.refresh();

      expect(await reopenItem(inbox, key)).toBe(false);
      const root = render(<InboxView inbox={inbox} />);
      await settled();
      expect(root.querySelector("section h2")).toBeNull();
      expect(inbox.shownItem.key).toBeUndefined();
    });

    it("leaves the list showing when it fails to load", async () => {
      const key = await reviewKey();
      const fake = fakeRuns([notes, review]);
      fake.fail(new Error("fetch failed"));
      const inbox = new Inbox(fake.runs);
      const reopened = reopenItem(inbox, key);
      await inbox.refresh();

      expect(await reopened).toBe(false);
    });

    it("stops listening and asks for nothing once its window stops", async () => {
      const key = await reviewKey();
      const inbox = new Inbox(fakeRuns([notes, review]).runs);
      const stopping = new AbortController();
      const reopened = reopenItem(inbox, key, stopping.signal);
      stopping.abort();
      await inbox.refresh();

      expect(await reopened).toBe(false);
      expect(inbox.shownItem.key).toBeUndefined();
      expect(inbox.takeOpenRequest()).toBeUndefined();
    });
  });

  describe("Inbox.shownItem", () => {
    it("tells its watchers each item the page shows, once per change", async () => {
      const key = await reviewKey();
      const inbox = new Inbox(fakeRuns([notes, review]).runs);
      await inbox.refresh();
      const watcher = vi.fn();
      inbox.shownItem.watch(watcher);
      render(<InboxView inbox={inbox} />);
      await settled();

      act(() => inbox.requestOpen(key));
      await settled();

      expect(watcher.mock.calls).toEqual([[key]]);
    });
  });
});
