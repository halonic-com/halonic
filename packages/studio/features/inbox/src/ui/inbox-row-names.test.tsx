// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();
const facts = { hubId: "acme", workflow: "Support reply", startedBy: "a message" };

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function rowCells(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[role="grid"] [role="gridcell"]')];
}

/** What a screen reader hears for a cell named by its content: its text, less what's hidden. */
function heardName(cell: HTMLElement): string {
  const copy = cell.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent ?? "";
}

verifies("inbox.page", () => {
  it("tells two waiting runs of one workflow apart by their short ids, for a screen reader too", async () => {
    const first = waitingRun("run_mfx3k2a1_01jd8q", {
      lastWaitingAt: at(9, 0),
      waitingFor: { title: "Approve this reply?", body: "Dear Ana, your refund is on its way." },
    });
    const second = waitingRun("run_mfx3k9z7_891b5a", {
      lastWaitingAt: at(9, 0),
      waitingFor: { title: "Approve this reply?", body: "Dear Ben, your order ships today." },
    });
    const root = render(
      <InboxView
        inbox={new Inbox(fakeRuns([first, second]).runs)}
        now={() => new Date(2026, 10, 8, 10, 43)}
        runFacts={() => facts}
      />,
    );
    await settled();
    const cells = rowCells(root);
    expect(cells.map(heardName).sort()).toEqual([
      "Approve this reply?Support reply · run 01jd8q · a person step · Waiting 1 h",
      "Approve this reply?Support reply · run 891b5a · a person step · Waiting 1 h",
    ]);
    // Named by their content, so the id is in what a screen reader hears, not only on screen.
    expect(cells.filter((cell) => cell.hasAttribute("aria-label"))).toEqual([]);
    // No run's input shows in the list (HAL-12461, option b).
    expect(root.querySelector('[role="grid"]')?.textContent).not.toContain("Dear");
  });
});
