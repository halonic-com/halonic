// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import {
  agentChange,
  historyRow,
  listColumn,
  openColumnsPage,
  pane,
  pressEnter,
  pressEscape,
  readmeChange,
  sorterVersion,
} from "../test-support/changes-columns-page.tsx";
import { openItem } from "../test-support/open-item.ts";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

verifies("source-control.list-column", () => {
  it("draws the list alone in the window's list column, and the pane alone in the page", async () => {
    const { root } = await openColumnsPage({ changes: [agentChange, readmeChange], split: true });
    const list = listColumn(root);
    expect(list?.closest("main")).toBeNull();
    expect(list?.querySelector("h2")?.textContent).toBe("Changes");
    expect(list?.querySelector('[data-pane="content"]')).toBeNull();
    const page = root.querySelector("main");
    expect(page?.querySelector('[data-pane="list"]')).toBeNull();
    expect(page?.querySelectorAll("h1")).toHaveLength(1);
    expect(page?.querySelector("h1")?.textContent).toBe("Changes");
    expect(pane(root)?.textContent).toContain("2 items");
  });

  it("opens in the page's pane the row picked in the list column, with focus on its name", async () => {
    const { root } = await openColumnsPage({ changes: [agentChange, readmeChange], split: true });
    openItem(root, "Triage");
    const heading = pane(root)?.querySelector("h2");
    expect(heading?.textContent).toBe("Triage");
    expect(document.activeElement).toBe(heading);
    const current = listColumn(root)?.querySelector('[aria-current="true"]');
    expect(current?.textContent).toContain("Triage");
  });

  it("shows a version picked in History in the pane, and Escape puts focus back on its row", async () => {
    const { root } = await openColumnsPage({
      changes: [agentChange],
      history: [sorterVersion],
      split: true,
    });
    pressEnter(historyRow(root, sorterVersion.name));
    expect(pane(root)?.querySelector("h2")?.textContent).toBe(sorterVersion.name);
    pressEscape();
    expect(document.activeElement).toBe(historyRow(root, sorterVersion.name));
  });
});
