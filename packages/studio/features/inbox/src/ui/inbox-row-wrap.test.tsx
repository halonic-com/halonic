// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { inboxItems, isRunItem, type SetupItem } from "../inbox-items.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { inboxRow, waitingLine } from "./inbox-row.tsx";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();
const facts = { hubId: "acme", workflow: "Support reply", startedBy: "a message" };

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The Inbox with one run waiting at a person step for an hour, titled `title`. */
async function inboxWith(title: string): Promise<HTMLElement> {
  const run = waitingRun("run_mfx3k9z7_891b5a", {
    lastWaitingAt: at(9, 0),
    waitingFor: { title, body: "Dear Ben, your order ships today." },
  });
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([run]).runs)}
      now={() => new Date(2026, 10, 8, 10, 0)}
      runFacts={() => facts}
    />,
  );
  await settled();
  return root;
}

/**
 * The innermost span in the Needs you grid's cells whose text is exactly `text`: a new row's mark
 * wraps the line in a span with the same text.
 */
function spanWith(root: HTMLElement, text: string): Element | undefined {
  return [...root.querySelectorAll('[role="grid"] [role="gridcell"] span')].findLast(
    (span) => span.textContent === text,
  );
}

verifies("inbox.row-meta-wraps", () => {
  it("keeps the Inbox row's line on one line, with Waiting 1 h whole at its top right", async () => {
    const root = await inboxWith("Approve this reply?");
    const line = spanWith(root, "Support reply · run 891b5a · a person step");
    expect(line?.className).not.toContain("line-clamp-2");
    expect(line?.className).toContain("truncate");
    const time = line?.closest('[role="gridcell"]')?.querySelector('[data-part="wait-time"]');
    expect(time?.textContent).toBe("Waiting 1\u00a0h");
    expect(time?.closest('[data-part="end-column"]')).not.toBeNull();
  });

  it("keeps the wait off the line, and the open item's header has the line whole", () => {
    const now = new Date(2026, 10, 8, 10, 0);
    const [item] = inboxItems([waitingRun("run_mfx3k9z7_891b5a", { lastWaitingAt: at(9, 0) })]);
    if (item === undefined || !isRunItem(item)) throw new Error("no run item");
    const row = inboxRow(item, now, () => facts);
    expect(row.metaEnd).toBeUndefined();
    expect(row.meta).toBe("Support reply · run 891b5a · a person step");
    expect(waitingLine(item, now, facts)).toBe(
      "Support reply · run 891b5a · a person step · Waiting 1\u00a0h",
    );
  });

  it("sets it on every row, as Home's Needs you shows them too", () => {
    const now = new Date(2026, 10, 8, 10, 0);
    const setup: SetupItem = {
      kind: "setup",
      key: "setup:google:acme",
      provider: "google",
      account: "acme",
      title: "Set up Google",
      progress: "Step 4 of 7 · Scopes",
      changedAt: at(9, 0),
    };
    expect(inboxRow(setup, now, undefined).wrapMeta).toBe(true);
  });
});

verifies("inbox.proposal-page", () => {
  it("clamps a long title to two lines in the Inbox's 80px rows", async () => {
    const root = await inboxWith("Approve the refund for the Acme order from last week");
    const title = spanWith(root, "Approve the refund for the Acme order from last week");
    expect(title?.className).toContain("line-clamp-2");
    expect(title?.className).toContain("leading-5");
    const inside = title?.closest('[role="gridcell"]')?.firstElementChild;
    expect(inside?.className.split(" ")).toContain("h-20");
  });
});
