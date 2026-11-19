// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Button } from "../button/button.tsx";
import { fakePopover, restorePopover } from "../test/popover.ts";
import { render, unmountAll } from "../test/render.tsx";
import { Menu, type MenuEntry } from "./menu.tsx";

beforeEach(() => {
  fakePopover();
});

afterEach(() => {
  unmountAll();
  restorePopover();
});

const entries: readonly MenuEntry[] = [
  {
    id: "sample",
    label: "Acme sample",
    detail: "~/Documents/Acme sample",
    tag: "Demo",
    onSelect: vi.fn(),
  },
  { id: "beta", label: "Beta", detail: "~/Work/beta", onSelect: vi.fn() },
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
    <Menu trigger={(props) => <Button {...props}>Workspace: Acme</Button>} entries={entries} />,
  );
  return Array.from(container.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));
}

verifies("kit.menu-tag", () => {
  it("shows the tag after the label as an outline tag, and reads it after the name", () => {
    const [sample] = rows();
    const tag = sample?.querySelector("[aria-hidden=true] > span.border-border-strong");
    expect(tag?.textContent).toBe("Demo");
    expect(spoken(sample as HTMLElement)).toBe("Acme sample, Demo");
  });

  it('names the item "Acme sample, Demo" itself, so no browser adds a space before the comma', () => {
    // Chromium puts a space around a hidden, positioned span when it builds a name from content.
    const [sample, beta] = rows();
    expect(sample?.getAttribute("aria-label")).toBe("Acme sample, Demo");
    expect(sample?.querySelector(".sr-only")).toBeNull();
    expect(beta?.hasAttribute("aria-label")).toBe(false);
  });

  it("gives an item with no tag none", () => {
    const [, beta] = rows();
    expect(beta?.querySelector(".border-border-strong")).toBeNull();
    expect(spoken(beta as HTMLElement)).toBe("Beta");
  });
});
