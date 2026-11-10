// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import type { MenuEntry } from "../menu/menu.tsx";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { HeaderBadgeSheet } from "./header-badge-sheet.tsx";

afterEach(() => {
  unmountAll();
  vi.clearAllMocks();
});

const costLine = "Runs on the built-in test model, with scripted replies. No key, no cost.";
const useRealModel = vi.fn();
const removeSample = vi.fn();
const wait = vi.fn();

const entries: readonly MenuEntry[] = [
  { id: "remove", label: "Remove the sample", danger: true, onSelect: removeSample },
  { id: "real", label: "Use a real model…", onSelect: useRealModel },
  "divider",
  { id: "about", label: "About the sample", onSelect: vi.fn() },
  {
    id: "tests",
    label: "Run its tests",
    unavailable: { reason: "Finish getting updates first." },
    onSelect: wait,
  },
];

function renderSheet(onClose = vi.fn()) {
  const { container } = render(
    <PresentationProvider presentation="phone">
      <HeaderBadgeSheet
        title="Sample · test model"
        description={costLine}
        entries={entries}
        onClose={onClose}
      />
    </PresentationProvider>,
  );
  const rows = Array.from(container.querySelectorAll<HTMLButtonElement>("li > button"));
  return { container, rows };
}

const labelOf = (row: HTMLElement) => row.querySelector("span > span")?.textContent;

verifies("kit.header-badge-sheet", () => {
  it("is a panel sheet titled with the badge's words, Back at the top left", async () => {
    const onClose = vi.fn();
    const { container } = renderSheet(onClose);
    expect(container.querySelector("h2")?.textContent).toBe("Sample · test model");
    expect(document.activeElement).toBe(container.querySelector("h2"));
    const back = container.querySelector("header button") as HTMLButtonElement;
    expect(back.getAttribute("aria-label")).toBe("Back");
    await click(back);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("starts its body with the description line, in the Menu's type", () => {
    const { container } = renderSheet();
    const body = container.querySelector("h2")?.closest("aside")?.children[1] as HTMLElement;
    const line = body.firstElementChild as HTMLElement;
    expect(line.tagName).toBe("P");
    expect(line.textContent).toBe(costLine);
    expect(line.className).toContain("text-small text-fg-muted");
  });

  it("lists the items as 48px link rows, divided, with a chevron, danger last, no dividers", () => {
    const { container, rows } = renderSheet();
    expect(rows.map(labelOf)).toEqual([
      "Use a real model…",
      "About the sample",
      "Run its tests",
      "Remove the sample",
    ]);
    expect(container.querySelector("hr")).toBeNull();
    for (const row of rows) {
      expect(row.className).toContain("min-h-touch");
      expect(row.className).toContain("border-b border-border");
      expect(row.className).toContain("focus-ring-inset");
      expect(row.querySelector("[aria-hidden=true] svg")).not.toBeNull();
    }
    expect(rows.at(-1)?.className).toContain("text-danger");
  });

  it("calls an item's onSelect when its row is tapped", async () => {
    const { rows } = renderSheet();
    await click(rows[0] as HTMLButtonElement);
    expect(useRealModel).toHaveBeenCalledOnce();
  });

  it("keeps an unavailable item listed with its reason, and does nothing on a tap", async () => {
    const { rows } = renderSheet();
    const row = rows[2] as HTMLButtonElement;
    expect(row.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(row.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Finish getting updates first.");
    await click(row);
    expect(wait).not.toHaveBeenCalled();
  });
});
