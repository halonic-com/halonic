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
    tag: "Sample",
    onSelect: vi.fn(),
  },
  { id: "beta", label: "Beta", detail: "~/Work/beta", onSelect: vi.fn() },
];

/** What a screen reader takes from a row's content: its text without the hidden parts. */
function spoken(element: HTMLElement): string {
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
    expect(tag?.textContent).toBe("Sample");
    expect(spoken(sample as HTMLElement)).toBe("Acme sample, Sample");
  });

  it("gives an item with no tag none", () => {
    const [, beta] = rows();
    expect(beta?.querySelector(".border-border-strong")).toBeNull();
    expect(spoken(beta as HTMLElement)).toBe("Beta");
  });
});
