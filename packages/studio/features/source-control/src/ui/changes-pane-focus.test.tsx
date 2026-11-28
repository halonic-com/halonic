// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { UpdateMerge } from "../api.ts";
import { settle } from "../source.test-helper.ts";
import {
  agentChange,
  listColumn,
  openColumnsPage,
  pane,
  press,
  readmeChange,
} from "../test-support/changes-columns-page.tsx";
import { openItem } from "../test-support/open-item.ts";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

const left: UpdateMerge = {
  items: [{ path: "x.md", mine: "a\n", theirs: "b\n", choice: undefined, copy: undefined }],
  versions: 2,
  people: ["Sam"],
};

verifies("source-control.list-column", () => {
  describe("Focus and Get updates beside the content pane", () => {
    it("puts focus on the row that took the place of an item undone in the pane", async () => {
      const { fake, root } = await openColumnsPage({ changes: [agentChange, readmeChange] });
      const page = openItem(root, "Triage");
      fake.answer({ kind: "ready", changes: [readmeChange] });
      await press(page, "Undo these changes");
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("Changes");
      expect(document.activeElement?.closest('[data-pane="list"]')).not.toBeNull();
      expect(document.activeElement?.textContent).toContain("README.md");
    });

    it("leaves focus where it is when a read nobody asked for closes the open item", async () => {
      const { fake, root } = await openColumnsPage({
        changes: [agentChange, readmeChange],
        remote: true,
      });
      openItem(root, "Triage");
      // The button holds its busy label too, so its text starts with its name.
      const getUpdates = [...root.querySelectorAll<HTMLElement>("button")].find((button) =>
        button.textContent?.trim().startsWith("Get updates"),
      );
      expect(getUpdates).toBeDefined();
      act(() => getUpdates?.focus());
      fake.answer({ kind: "ready", changes: [readmeChange] });
      await act(async () => {
        fake.wake();
        await settle();
      });
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("Changes");
      expect(document.activeElement).toBe(getUpdates);
      // The last item open, and gone in a read: the heading doesn't take the focus either.
      openItem(root, "README.md");
      act(() => getUpdates?.focus());
      fake.answer({ kind: "ready", changes: [] });
      await act(async () => {
        fake.wake();
        await settle();
      });
      expect(pane(root)?.textContent).toContain("Nothing has changed since your last version.");
      expect(document.activeElement).toBe(getUpdates);
    });

    it("shows Get updates' choices in the pane in place of an open item", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange], left });
      openItem(root, "Triage");
      await press(root, "Continue");
      expect(pane(root)?.textContent).toContain("Keep mine");
      expect(pane(root)?.textContent).not.toContain("Undo these changes");
      expect(listColumn(root)?.querySelector('[aria-current="true"]')).toBeNull();
    });

    it("titles the choices as the pane titles an item, and puts Get updates' reason under it", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange], left });
      await press(root, "Continue");
      const title = pane(root)?.querySelector("h2");
      expect(title?.textContent).toBe("Getting updates");
      expect(title?.classList.contains("text-title")).toBe(true);
      const reason = [...(listColumn(root)?.querySelectorAll("header span") ?? [])].find(
        (span) => span.textContent === "Finish getting updates first.",
      );
      expect(reason?.classList.contains("basis-full")).toBe(true);
    });

    it("stacks an item's tiles by the pane's width, side by side only where three fit", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange], left });
      await press(root, "Continue");
      const choices = pane(root)?.querySelector("section");
      expect(choices?.classList.contains("@container")).toBe(true);
      const tiles = choices?.querySelector('[aria-label="x.md"] > div.flex.gap-4');
      expect([...(tiles?.classList ?? [])]).toEqual(
        expect.arrayContaining(["flex-col", "@lg:flex-row", "@lg:items-stretch"]),
      );
      expect(tiles?.classList.contains("flex-row")).toBe(false);
    });

    it("puts the choices aside, with Continue, when a row is opened while they show", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange], left });
      await press(root, "Continue");
      openItem(root, "Triage");
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("Triage");
      expect(pane(root)?.textContent).not.toContain("Keep mine");
      expect(listColumn(root)?.textContent).toContain(
        "You're in the middle of getting Sam's updates.",
      );
      await press(root, "Continue");
      expect(pane(root)?.textContent).toContain("Keep mine");
    });
  });
});
