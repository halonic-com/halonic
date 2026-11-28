// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { UpdateMerge } from "../api.ts";
import { settle } from "../source.test-helper.ts";
import {
  agentChange,
  historyRow,
  listColumn,
  openColumnsPage,
  pane,
  press,
  pressEnter,
  pressEscape,
  sorterVersion,
} from "../test-support/changes-columns-page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

const left: UpdateMerge = {
  items: [{ path: "x.md", mine: "a\n", theirs: "b\n", choice: undefined, copy: undefined }],
  versions: 2,
  people: ["Sam"],
};

const changeRow = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>('[data-pane="list"] td[role="gridcell"]')].find((cell) =>
    cell.textContent?.startsWith(name),
  );

const currentRows = (root: HTMLElement) =>
  listColumn(root)?.querySelectorAll('tr[aria-current="true"]').length ?? 0;

verifies("source-control.list-column", () => {
  describe("Presses, reads and the choices in the content pane", () => {
    it("moves focus to the version's name on each press, and leaves it on the row for a read", async () => {
      const { fake, root } = await openColumnsPage({
        changes: [agentChange],
        history: [sorterVersion],
      });
      pressEnter(historyRow(root, sorterVersion.name));
      expect(document.activeElement?.textContent).toBe(sorterVersion.name);
      pressEscape();
      expect(document.activeElement).toBe(historyRow(root, sorterVersion.name));
      pressEnter(historyRow(root, sorterVersion.name));
      expect(document.activeElement?.tagName).toBe("H2");
      expect(document.activeElement?.textContent).toBe(sorterVersion.name);
      pressEscape();
      await act(async () => {
        fake.wake();
        await settle();
      });
      expect(document.activeElement).toBe(historyRow(root, sorterVersion.name));
    });

    it("moves focus to an open item's name again when its row is pressed again", async () => {
      const { root } = await openColumnsPage({ changes: [agentChange] });
      pressEnter(changeRow(root, "Triage"));
      expect(document.activeElement?.textContent).toBe("Triage");
      act(() => changeRow(root, "Triage")?.focus());
      pressEnter(changeRow(root, "Triage"));
      expect(document.activeElement?.tagName).toBe("H2");
      expect(document.activeElement?.textContent).toBe("Triage");
    });

    it("closes an open version when the choices open, and puts them aside when one is picked", async () => {
      const { root } = await openColumnsPage({
        changes: [agentChange],
        history: [sorterVersion],
        left,
      });
      pressEnter(historyRow(root, sorterVersion.name));
      await press(root, "Continue");
      expect(pane(root)?.textContent).toContain("Keep mine");
      expect(currentRows(root)).toBe(0);
      pressEnter(historyRow(root, sorterVersion.name));
      expect(pane(root)?.querySelector("h2")?.textContent).toBe(sorterVersion.name);
      expect(pane(root)?.textContent).not.toContain("Keep mine");
      expect(listColumn(root)?.textContent).toContain(
        "You're in the middle of getting Sam's updates.",
      );
    });

    it("shows the columns under a first read, with Changes alone in the pane", async () => {
      const { root, releaseFirstRead } = await openColumnsPage({
        changes: [agentChange],
        holdFirstRead: true,
      });
      expect(listColumn(root)).not.toBeNull();
      expect(pane(root)?.textContent).toBe("Changes");
      await act(async () => {
        releaseFirstRead();
        await settle();
      });
      expect(pane(root)?.textContent).toBe("Changes1 item");
    });

    it("shows one page when the first read fails, and the columns after Try again, focus on the h1", async () => {
      const { fake, root } = await openColumnsPage({
        changes: [agentChange],
        failReads: new KindedError("unavailable", "Locked"),
      });
      expect(root.textContent).toContain("Couldn't load changes");
      expect(root.querySelector("[data-pane]")).toBeNull();
      fake.failReads(undefined);
      await press(root, "Try again");
      expect(listColumn(root)).not.toBeNull();
      expect(document.activeElement?.tagName).toBe("H1");
      expect(document.activeElement?.textContent).toBe("Changes");
    });
  });
});
