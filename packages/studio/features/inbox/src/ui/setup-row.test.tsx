// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, Suspense } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { fakeSetups, setupEntry } from "../fake-setups.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, renderSuspending, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { NeedsYouView } from "./needs-you-card.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();
const now = () => new Date(2026, 10, 8, 10, 43);

const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", at(10, 42))],
});

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** An Inbox with one Google account at step 4 and one run waiting for an OK, once it has loaded. */
async function inboxWithSetup() {
  const inbox = new Inbox(fakeRuns([notes]).runs);
  const google = fakeSetups("google", [setupEntry("acct-1", at(9, 0))]);
  inbox.addSetupSource(google.source);
  await settled();
  return { inbox, google };
}

function cells(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[role="grid"] [role="gridcell"]')];
}

verifies("inbox.setup-items", () => {
  it("shows the setup row first, with its line and a Setup chip, and no button", async () => {
    const { inbox } = await inboxWithSetup();
    const root = render(<InboxView inbox={inbox} now={now} />);
    expect(cells(root).map((cell) => cell.textContent)).toEqual([
      "Set up Google for x@example.comStep 4 of 7 · ScopesSetup",
      "sorter wants to use create_note (notes-mcp)Waiting 1 min",
    ]);
    expect(root.querySelector('[role="grid"] button')).toBeNull();
    expect(root.textContent).not.toMatch(/Approve|Reject|Delete/);
  });

  it("opens from Home's Needs you with the setup item's title focused", async () => {
    const { inbox } = await inboxWithSetup();
    const openInbox = vi.fn();
    const home = await renderSuspending(
      <Suspense>
        <NeedsYouView inbox={inbox} openInbox={openInbox} now={now} />
      </Suspense>,
    );
    const cell = cells(home)[0] as HTMLElement;
    act(() => cell.focus());
    act(() => {
      cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(openInbox).toHaveBeenCalledTimes(1);

    const page = render(<InboxView inbox={inbox} now={now} />);
    const title = page.querySelector("section h2");
    expect(title?.textContent).toBe("Set up Google for x@example.com");
    expect(document.activeElement).toBe(title);
    expect(page.querySelector("section")?.textContent).toContain("Step 4 of 7 · Scopes");
  });

  it("shows the new line when the source moves on", async () => {
    const { inbox, google } = await inboxWithSetup();
    const root = render(<InboxView inbox={inbox} now={now} />);
    google.change([setupEntry("acct-1", at(9, 5), { progress: "Step 5 of 7 · Test users" })]);
    await settled();
    expect(cells(root)[0]?.textContent).toContain("Step 5 of 7 · Test users");
  });
});
