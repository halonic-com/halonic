// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import type { MenuEntry } from "../menu/menu.tsx";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { HeaderBadgeSheet } from "./header-badge-sheet.tsx";

afterEach(() => {
  unmountAll();
});

const entries: readonly MenuEntry[] = [
  { heading: "Recent" },
  {
    id: "sample",
    label: "Acme sample",
    detail: "~/Documents/Acme sample",
    tag: "Demo",
    checked: true,
    onSelect: vi.fn(),
  },
  { id: "beta", label: "Beta", detail: "~/Work/beta", checked: false, onSelect: vi.fn() },
];

/** A row's name for a screen reader: its label, or else its text without the hidden parts. */
function spoken(element: HTMLElement): string {
  const label = element.getAttribute("aria-label");
  if (label !== null) return label;
  const copy = element.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll("[aria-hidden=true]")) hidden.remove();
  return copy.textContent ?? "";
}

function rows(): readonly HTMLButtonElement[] {
  const { container } = render(
    <PresentationProvider presentation="phone">
      <HeaderBadgeSheet title="Workspace" entries={entries} onClose={vi.fn()} />
    </PresentationProvider>,
  );
  return Array.from(container.querySelectorAll<HTMLButtonElement>("li > button"));
}

verifies("kit.header-badge-sheet-rows", () => {
  it("shows the detail under the label, the tag, and a tick on the current item", () => {
    const [sample] = rows();
    const row = sample as HTMLButtonElement;
    const detail = document.getElementById(row.getAttribute("aria-describedby") ?? "");
    expect(detail?.textContent).toBe("~/Documents/Acme sample");
    expect(row.contains(detail)).toBe(true);
    expect(row.querySelector(".border-border-strong")?.textContent).toBe("Demo");
    expect(spoken(row)).toBe("Acme sample, Demo");
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(row.querySelector(".text-accent svg")).not.toBeNull();
  });

  it('names the item "Acme sample, Demo" itself, so no browser adds a space before the comma', () => {
    // Chromium puts a space around a hidden, positioned span when it builds a name from content.
    const [sample, beta] = rows();
    expect(sample?.getAttribute("aria-label")).toBe("Acme sample, Demo");
    expect(sample?.querySelector(".sr-only")).toBeNull();
    expect(beta?.hasAttribute("aria-label")).toBe(false);
  });

  it("gives a row with no tag and not checked neither", () => {
    const [, beta] = rows();
    const row = beta as HTMLButtonElement;
    expect(row.querySelector(".border-border-strong")).toBeNull();
    expect(row.hasAttribute("aria-current")).toBe(false);
    expect(row.querySelector(".text-accent")).toBeNull();
    expect(spoken(row)).toBe("Beta");
  });
});
