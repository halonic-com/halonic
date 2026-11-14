// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxRunsService, InboxService } from "../api.ts";
import { fakeRuns, WorkspaceServices } from "../fake-runs.test-helper.ts";
import { inboxFeature } from "../feature.ts";
import { Inbox, type InboxRuns } from "../inbox.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

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

/** The Inbox page on a clock the test moves, once its first load has settled. */
async function openPage(runs: InboxRuns) {
  const clock = { now: new Date(2026, 10, 8, 10, 43) };
  const inbox = new Inbox(runs);
  const root = render(<InboxView inbox={inbox} now={() => clock.now} />);
  await settled();
  const later = (seconds: number) => {
    clock.now = new Date(clock.now.getTime() + seconds * 1000);
  };
  return { root, inbox, later };
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

/** What a screen reader hears for an element named by `aria-labelledby`. */
function nameOf(root: HTMLElement, element: Element | null): string {
  const id = element?.getAttribute("aria-labelledby") ?? "";
  const label = root.querySelector(`[id="${id}"]`)?.cloneNode(true) as Element | undefined;
  for (const hidden of label?.querySelectorAll('[aria-hidden="true"]') ?? []) hidden.remove();
  return label?.textContent ?? "";
}

verifies("inbox.page", () => {
  describe("the place", () => {
    it("adds the Inbox place, whose count is the workspace Inbox's and follows it", async () => {
      const shell = createShell({ features: [inboxFeature], hostServices: [InboxRunsService] });
      const fake = fakeRuns([notes]);
      const workspace = new WorkspaceServices();
      workspace.provide(InboxRunsService, fake.runs);
      shell.services.instantiate(workspace);
      const place = shell.contributions.places.list().find((added) => added.id === "inbox");
      const context = shell.services.contextFor("inbox", workspace);
      await workspace.get(InboxService).refresh();
      expect(place?.signal?.(context)).toEqual({ mark: "count", value: 1, spoken: "1 waiting" });

      const listener = vi.fn();
      const stop = place?.subscribeSignal?.(context, listener);
      fake.change([notes, review]);
      await settled();
      expect(listener).toHaveBeenCalled();
      expect(place?.signal?.(context)?.value).toBe(2);
      stop?.();
      expect(await place?.load()).toHaveProperty("InboxPage");
    });
  });

  describe("the list", () => {
    it("names Needs you with its count, lists newest first and opens nothing", async () => {
      const { root } = await openPage(fakeRuns([review, notes]).runs);
      expect(root.querySelector("h1")?.textContent).toBe("Inbox");
      const grid = root.querySelector('[role="grid"]');
      expect(nameOf(root, grid)).toBe("Needs you, 2 waiting");
      // The agent by its id until the Studio knows agents' names.
      expect(rows(root).map((row) => row.querySelector("[role=gridcell]")?.textContent)).toEqual([
        "sorter wants to use create_note (notes-mcp)Waiting 1 min",
        "Approve this reply?Waiting 1 h · moves on Sun 14:00",
      ]);
      expect(root.querySelector("[aria-current]")).toBeNull();
      expect(root.textContent).toContain("Pick something on the left to see it here.");
    });

    it("marks an item that has waited a day with an amber Late chip and counts it in the header", async () => {
      const stale = waitingRun("r3", {
        lastWaitingAt: new Date(2026, 10, 6, 9, 0).toISOString(),
        waitingFor: { title: "Approve the invoice?", body: "" },
      });
      const { root } = await openPage(fakeRuns([notes, stale]).runs);
      expect(nameOf(root, root.querySelector('[role="grid"]'))).toBe(
        "Needs you, 2 waiting, 1 late",
      );
      const chips = root.querySelectorAll('[role="grid"] .bg-attention-soft');
      expect([...chips].map((chip) => chip.textContent)).toEqual(["Late"]);
      expect(rows(root)[1]?.textContent).toContain("Late");
      expect(rows(root)[0]?.textContent).not.toContain("Late");
    });

    it("says nothing about late when nothing is", async () => {
      const { root } = await openPage(fakeRuns([notes, review]).runs);
      expect(root.textContent).not.toContain("late");
    });

    it("opens a row's card beside the list, with no Open run until there's a run page", async () => {
      const { root } = await openPage(fakeRuns([notes, review]).runs);
      await click(rowCell(root, 1));
      expect(rows(root)[1]?.getAttribute("aria-current")).toBe("true");
      const title = root.querySelector("section h2");
      expect(title?.textContent).toBe("Approve this reply?");
      expect(document.activeElement).toBe(title);
      expect(root.textContent).not.toContain("Pick something on the left");
      expect(root.textContent).not.toContain("Open run");
    });

    it("keeps the decided card while its item leaves, and Next opens the next item", async () => {
      const { root, later } = await openPage(fakeRuns([notes, review]).runs);
      await click(rowCell(root, 0));
      later(2);
      await click(button(root, "Approve"));
      await settled();
      expect(root.textContent).toContain("Approved by you at 10:43. The run continues.");
      expect(nameOf(root, root.querySelector('[role="grid"]'))).toBe("Needs you, 1 waiting");
      expect(rows(root)).toHaveLength(1);

      await click(button(root, "Next: Approve this reply?"));
      expect(root.querySelector("section h2")?.textContent).toBe("Approve this reply?");
      expect(rows(root)[0]?.getAttribute("aria-current")).toBe("true");
    });

    it("has Next open the item after the decided one, not the first", async () => {
      const send = waitingRun("r3", {
        approvals: [pendingApproval("call-3", "mail-mcp__send_reply", at(10, 0))],
      });
      const { root, later } = await openPage(fakeRuns([notes, send, review]).runs);
      expect(rows(root)).toHaveLength(3);
      await click(rowCell(root, 1));
      later(2);
      await click(button(root, "Approve"));
      await settled();
      expect(rows(root)).toHaveLength(2);

      await click(button(root, "Next: Approve this reply?"));
      expect(root.querySelector("section h2")?.textContent).toBe("Approve this reply?");
      expect(rows(root)[1]?.getAttribute("aria-current")).toBe("true");
    });
  });

  describe("whole-Inbox states", () => {
    it("says nothing waits, in the list and the pane, with no count", async () => {
      const { root } = await openPage(fakeRuns([]).runs);
      expect(root.querySelector('[role="grid"]')).toBeNull();
      expect(root.textContent).toContain("Needs you");
      expect(root.textContent).toContain("Nothing is waiting for you.");
      expect(root.textContent).toContain("Approvals and questions from your runs show up here.");
      expect(root.textContent).not.toContain("waiting,");
    });

    it("says it's loading the Inbox until the first list loads", async () => {
      const runs: InboxRuns = {
        waiting: () => new Promise(() => {}),
        subscribe: () => () => {},
        send: vi.fn(),
      };
      const { root } = await openPage(runs);
      expect(root.querySelector('[role="grid"]')).toBeNull();
      expect(root.textContent).not.toContain("Nothing is waiting");
      expect(root.textContent).not.toContain("Pick something");
    });

    it("says it couldn't load, that the engine isn't answering, and tries again", async () => {
      const fake = fakeRuns([notes]);
      fake.fail(new Error("fetch failed"));
      const { root } = await openPage(fake.runs);
      expect(root.textContent).toContain("Couldn't load the Inbox");
      expect(root.textContent).toContain("The engine isn't answering. It may still be starting.");
      expect(root.textContent).not.toContain("fetch failed");

      fake.answer();
      await click(button(root, "Try again"));
      await settled();
      expect(rows(root)).toHaveLength(1);
      expect(root.textContent).not.toContain("Couldn't load the Inbox");
    });

    it("keeps the items when a later load fails, and says they're what the engine said last", async () => {
      const fake = fakeRuns([notes]);
      const { root, inbox } = await openPage(fake.runs);
      fake.fail(new Error("fetch failed"));
      await act(() => inbox.refresh());
      expect(rows(root)).toHaveLength(1);
      expect(root.textContent).toContain("The engine isn't answering. Showing what it said last.");
    });
  });

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
      await click(button(root, "Back to Inbox"));
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
      expect(button(root, "Back to Inbox")).toBeDefined();
    });

    it("has no Back link on the desktop", async () => {
      const { root } = await openPage(fakeRuns([notes, review]).runs);
      await click(rowCell(root, 1));
      expect(root.textContent).not.toContain("Back to Inbox");
    });
  });
});
