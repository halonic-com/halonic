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
    tag: "Sample",
    checked: true,
    onSelect: vi.fn(),
  },
  { id: "beta", label: "Beta", detail: "~/Work/beta", checked: false, onSelect: vi.fn() },
];

/** What a screen reader takes from a row's content: its text without the hidden parts. */
function spoken(element: HTMLElement): string {
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
    expect(row.querySelector(".border-border-strong")?.textContent).toBe("Sample");
    expect(spoken(row)).toBe("Acme sample, Sample");
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(row.querySelector(".text-accent svg")).not.toBeNull();
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
