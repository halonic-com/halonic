// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox, type InboxRuns } from "../inbox.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

// The line over the list once a later load fails, moved out of inbox-page.test.tsx so that file
// keeps its headroom under the size limit.

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const notes = waitingRun("r1", {
  approvals: [
    pendingApproval(
      "call-1",
      "notes-mcp__create_note",
      new Date(2026, 10, 8, 10, 42).toISOString(),
    ),
  ],
});

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The Inbox page, on a phone or not, once its first load has settled. */
async function openPage(runs: InboxRuns, presentation: "desktop" | "phone" = "desktop") {
  const inbox = new Inbox(runs);
  const root = render(
    <PresentationProvider presentation={presentation}>
      <InboxView inbox={inbox} now={() => new Date(2026, 10, 8, 10, 43)} />
    </PresentationProvider>,
  );
  await settled();
  return { root, inbox };
}

async function openPhone(runs: InboxRuns) {
  return openPage(runs, "phone");
}

verifies("inbox.page", () => {
  describe("the line over a list that failed to load again", () => {
    it("says the line over the list in a polite status that was there before it (HAL-13801 SO2)", async () => {
      const fake = fakeRuns([notes]);
      const { root, inbox } = await openPage(fake.runs);
      const status = root.querySelector('[data-pane="list"] [role="status"]');
      expect(status?.textContent).toBe("");
      fake.fail(new KindedError("unauthenticated", "Sign in again to list what waits for you."));
      await act(() => inbox.refresh());
      expect(root.querySelector('[data-pane="list"] [role="status"]')).toBe(status);
      expect(status?.textContent).toBe("Sign in again to list what waits for you.");
      // Try again is outside the live region, so it isn't read with every change (HAL-18617).
      expect(status?.querySelector("button")).toBeNull();
    });

    it("gives the line over the list the list's top space, under the top bar (HAL-13801 SO3)", async () => {
      const fake = fakeRuns([notes]);
      const { root, inbox } = await openPhone(fake.runs);
      fake.fail(new Error("fetch failed"));
      await act(() => inbox.refresh());
      const status = root.querySelector('[data-pane="list"] [role="status"]');
      expect(status?.closest(".pt-4")).not.toBeNull();
    });
  });
});
