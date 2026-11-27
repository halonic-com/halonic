// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { engineWords } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { InboxRuns } from "../inbox-runs.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

// The Inbox page on a phone, and its Back to Inbox, apart from `inbox-page.test.tsx` for size.

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();

const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", at(10, 42))],
});
const review = waitingRun("r2", {
  lastWaitingAt: at(9, 0),
  waitingFor: { title: "Approve this reply?", body: "" },
  nextTimer: at(14, 0),
});

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The Inbox page on the desktop, once its first load has settled. */
async function openPage(runs: InboxRuns) {
  const root = render(
    <InboxView inbox={new Inbox(runs)} now={() => new Date(2026, 10, 8, 10, 43)} />,
  );
  await settled();
  return { root };
}

function rows(root: HTMLElement): HTMLTableRowElement[] {
  return [...root.querySelectorAll<HTMLTableRowElement>('[role="grid"] tr')];
}

function rowCell(root: HTMLElement, index: number): HTMLElement {
  return rows(root)[index]?.querySelector('[role="gridcell"]') as HTMLElement;
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    target.click();
  });
}

verifies("inbox.page", () => {
  describe("on a phone", () => {
    async function openPhone(runs: InboxRuns) {
      const inbox = new Inbox(runs);
      const root = render(
        <PresentationProvider presentation="phone">
          <InboxView inbox={inbox} now={() => new Date(2026, 10, 8, 10, 43)} />
        </PresentationProvider>,
      );
      await settled();
      return { root, inbox };
    }

    const hidden = (root: HTMLElement, pane: "list" | "item") =>
      root.querySelector(`[data-pane="${pane}"]`)?.classList.contains("hidden") === true;

    it("shows the list as the whole page, with its heading for screen readers only", async () => {
      const { root } = await openPhone(fakeRuns([notes, review]).runs);
      expect(root.querySelector("h1")?.parentElement?.classList.contains("sr-only")).toBe(true);
      expect(root.querySelector(".w-90")).toBeNull();
      expect(rows(root)).toHaveLength(2);
      expect(hidden(root, "item")).toBe(true);
      expect(hidden(root, "list")).toBe(false);
    });

    it("opens an item as a page in place of the list, and Back to Inbox returns to the row", async () => {
      const { root } = await openPhone(fakeRuns([notes, review]).runs);
      await click(rowCell(root, 1));
      expect(root.querySelector("section h2")?.textContent).toBe("Approve this reply?");
      expect(hidden(root, "list")).toBe(true);
      await click(root.querySelector('[aria-label="Back to Inbox"]') as HTMLElement);
      expect(root.querySelector("section h2")).toBeNull();
      expect(hidden(root, "list")).toBe(false);
      expect(document.activeElement).toBe(rowCell(root, 1));
    });

    it("opens the item Home's Needs you asked for", async () => {
      const runs = fakeRuns([notes, review]).runs;
      const inbox = new Inbox(runs);
      await inbox.refresh();
      inbox.requestOpen(inbox.state.items[1]?.key ?? "");
      const root = render(
        <PresentationProvider presentation="phone">
          <InboxView inbox={inbox} />
        </PresentationProvider>,
      );
      await settled();
      expect(root.querySelector("section h2")?.textContent).toBe("Approve this reply?");
      expect(root.querySelector('[aria-label="Back to Inbox"]')).not.toBeNull();
    });

    it("shows the full empty state, with its description, when nothing waits", async () => {
      const { root } = await openPhone(fakeRuns([]).runs);
      expect(root.textContent).toContain("Nothing is waiting for you");
      expect(root.textContent).toContain("Approvals and questions from your runs show up here.");
    });

    it("words a failed load for the phone host, not the desktop app", async () => {
      const fake = fakeRuns([notes]);
      fake.fail(new Error("fetch failed"));
      const inbox = new Inbox(fake.runs);
      const root = render(
        <PresentationProvider presentation="phone">
          <InboxView inbox={inbox} words={engineWords.phone} />
        </PresentationProvider>,
      );
      await settled();
      expect(root.textContent).toContain("Halonic on your computer isn't answering.");
      expect(root.textContent).not.toContain("The engine isn't answering.");
    });

    it("gives the line over the list the list's top space, under the top bar (HAL-13801 SO3)", async () => {
      const fake = fakeRuns([notes]);
      const { root, inbox } = await openPhone(fake.runs);
      fake.fail(new Error("fetch failed"));
      await act(() => inbox.refresh());
      const status = root.querySelector('[data-pane="list"] [role="status"]');
      expect(status?.closest(".pt-4")).not.toBeNull();
    });

    it("has Next take the card's width and wrap its label as one run of text (HAL-13801 IN1, HAL-13830 IN2)", async () => {
      const clock = { now: new Date(2026, 10, 8, 10, 43) };
      const root = render(
        <PresentationProvider presentation="phone">
          <InboxView inbox={new Inbox(fakeRuns([notes, review]).runs)} now={() => clock.now} />
        </PresentationProvider>,
      );
      await settled();
      await click(rowCell(root, 0));
      clock.now = new Date(clock.now.getTime() + 2000);
      await click(button(root, "Approve"));
      await settled();
      const next = button(root, "Next: Approve this reply?");
      expect(next.classList.contains("w-full")).toBe(true);
      expect(next.className).not.toContain("whitespace-nowrap");
      // The button is a flex box: the label and the count are one item, so they wrap as one
      // sentence (HAL-14489 IX1). The name is given whole, with no space before its comma (HAL-15105).
      const items = [...next.children];
      expect(items.map((item) => item.textContent)).toEqual([
        "Next: Approve this reply? ·\u00a01\u00a0left",
      ]);
      expect(next.getAttribute("aria-label")).toBe("Next: Approve this reply?, 1 left");
      expect(next.querySelector(".sr-only")).toBeNull();
    });

    it("has no Back link on the desktop", async () => {
      const { root } = await openPage(fakeRuns([notes, review]).runs);
      await click(rowCell(root, 1));
      expect(root.querySelector('[aria-label="Back to Inbox"]')).toBeNull();
      expect(root.textContent).not.toContain("Back to Inbox");
    });
  });
});
