// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();
const now = () => new Date(2026, 10, 8, 10, 43);

const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", at(10, 42))],
});
const review = waitingRun("r2", {
  lastWaitingAt: at(9, 0),
  waitingFor: { title: "Approve this reply?", body: "" },
});

function mainCell(root: HTMLElement, title: string): HTMLElement {
  const cells = [...root.querySelectorAll<HTMLElement>('[role="grid"] [role="gridcell"]')];
  const found = cells.find((cell) => cell.textContent?.includes(title));
  if (found === undefined) throw new Error(`no row "${title}"`);
  return found;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const classesOf = (element: HTMLElement) => element.className.split(" ");

verifies("inbox.plain-rows", () => {
  it("draws Needs you as rounded rows with no box or lines, the open row with the soft fill", async () => {
    const inbox = new Inbox(fakeRuns([notes, review]).runs, now);
    const root = render(<InboxView inbox={inbox} now={now} />);
    await settled();
    for (const title of ["Approve this reply?", "create_note"]) {
      const cell = mainCell(root, title);
      expect(classesOf(cell)).toEqual(expect.arrayContaining(["rounded-l-md", "rounded-r-md"]));
      expect(classesOf(cell)).not.toContain("border-t");
    }
    expect(root.querySelector('[role="grid"]')?.closest(".border.border-border")).toBeNull();

    await act(async () => mainCell(root, "Approve this reply?").click());
    await settled();
    const open = mainCell(root, "Approve this reply?");
    expect(open.getAttribute("aria-current")).toBe("true");
    expect(classesOf(open)).toContain("bg-surface-muted");
    expect(classesOf(open)).not.toContain("selected-bar");
  });
});
