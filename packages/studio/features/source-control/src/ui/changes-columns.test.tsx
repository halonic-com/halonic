// @vitest-environment jsdom

import { listColumnClass } from "@halonicjs/studio-kit/list-column";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentChange,
  listColumn,
  openColumnsPage,
  pane,
  readmeChange,
  sorterVersion,
} from "../test-support/changes-columns-page.tsx";
import { openItem } from "../test-support/open-item.ts";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

const classesOf = (element: Element | null | undefined) => element?.className.split(" ") ?? [];

const historyRow = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>('[data-part="history-list"] [role="gridcell"]')].find(
    (cell) => cell.textContent?.includes(name),
  );

verifies("source-control.list-column", () => {
  describe("Changes in a list column beside a content pane", () => {
    it("puts the list in the kit's list column, beside a pane that takes the rest", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange, readmeChange] });
      // The whole class: the column has a fixed height, so without `*:shrink-0` a strip with only a
      // minimum height shrinks to it and its text runs over the next part (look check HAL-20951).
      expect(classesOf(listColumn(root))).toEqual([
        ...listColumnClass.split(" "),
        "flex",
        "shrink-0",
        "flex-col",
        "gap-4",
        "overflow-y-auto",
        "border-e",
        "border-border",
        "px-4",
        "py-5",
        "*:shrink-0",
      ]);
      // No padding of its own, so the empty pane's wash runs edge to edge.
      expect(classesOf(pane(root))).toEqual([
        "flex",
        "min-w-0",
        "flex-1",
        "flex-col",
        "overflow-y-auto",
      ]);
      expect(listColumn(root)?.textContent).toContain("Since your last version");
      // The header lets Get updates drop under "Changes" in a narrow column.
      expect(classesOf(listColumn(root)?.querySelector("header"))).toContain("flex-wrap");
    });

    it("says in the pane how many items changed, as the list counts them", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange, readmeChange] });
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("Changes");
      expect(pane(root)?.textContent).toBe("Changes2 items");
    });

    it("says nothing changed in the pane when no file changed", async () => {
      const { root } = await openColumnsPage();
      expect(pane(root)?.textContent).toBe("ChangesNothing has changed since your last version.");
    });

    it("fills the pane with the empty state's wash, and pads what opens in it", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange] });
      expect(classesOf(pane(root)?.firstElementChild)).toEqual(["grid", "flex-1"]);
      openItem(root, "Triage");
      expect(classesOf(pane(root)?.firstElementChild)).toEqual(
        expect.arrayContaining(["px-6", "py-5"]),
      );
    });

    it("draws one page with no column and no pane for a folder without history", async () => {
      const { root } = await openColumnsPage({ read: { kind: "not-a-repository" } });
      expect(listColumn(root)).toBeNull();
      expect(pane(root)).toBeNull();
      expect(root.textContent).toContain("Keep a history of your work");
    });

    it("draws one page with no column and no pane on a computer without git", async () => {
      const { root } = await openColumnsPage({ read: { kind: "no-git" } });
      expect(listColumn(root)).toBeNull();
      expect(pane(root)).toBeNull();
      expect(root.textContent).toContain("Halonic needs git to keep versions.");
    });

    it("opens a row's What changed in the pane, keeps the list and marks the row current", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange, readmeChange] });
      openItem(root, "Triage");
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("Triage");
      expect(document.activeElement?.textContent).toBe("Triage");
      const current = listColumn(root)?.querySelector('[aria-current="true"]');
      expect(current?.textContent).toContain("Triage");
      openItem(root, "README.md");
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("README.md");
      expect(document.activeElement?.textContent).toBe("README.md");
    });

    it("shows one thing in the pane: a picked version replaces the item, and a row the version", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange], history: [sorterVersion] });
      openItem(root, "Triage");
      await act(async () => historyRow(root, sorterVersion.name)?.click());
      expect(pane(root)?.querySelector("h2")?.textContent).toBe(sorterVersion.name);
      expect(document.activeElement?.textContent).toBe(sorterVersion.name);
      expect(listColumn(root)?.querySelectorAll('tr[aria-current="true"]')).toHaveLength(1);
      act(() => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(historyRow(root, sorterVersion.name));
      openItem(root, "Triage");
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("Triage");
      expect(pane(root)?.textContent).not.toContain(sorterVersion.name);
    });

    it("shows the list alone on a phone", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange], phone: true });
      expect(pane(root)).toBeNull();
      expect(root.textContent).toContain("Since your last version");
    });
  });
});
