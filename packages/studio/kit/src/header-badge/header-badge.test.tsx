// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MenuEntry } from "../menu/menu.tsx";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { fakePopover, isOpen, restorePopover } from "../test/popover.ts";
import { click, render, unmountAll } from "../test/render.tsx";
import { HeaderBadge } from "./header-badge.tsx";

beforeEach(() => {
  fakePopover();
});

afterEach(() => {
  unmountAll();
  restorePopover();
});

const costLine = "Runs on the built-in test model, with scripted replies. No key, no cost.";

const entries: readonly MenuEntry[] = [
  { id: "real", label: "Use a real model…", onSelect: vi.fn() },
  { id: "about", label: "About the sample", onSelect: vi.fn() },
  { id: "remove", label: "Remove the sample", onSelect: vi.fn() },
];

function onPhone(element: ReactNode): ReactNode {
  return <PresentationProvider presentation="phone">{element}</PresentationProvider>;
}

function sampleChip(onOpenSheet = vi.fn()) {
  return (
    <HeaderBadge as="menu" description={costLine} entries={entries} onOpenSheet={onOpenSheet}>
      Sample · test model
    </HeaderBadge>
  );
}

function trustBadge(onClick = vi.fn(), label?: string) {
  return (
    <HeaderBadge as="button" action="Review" label={label} onClick={onClick}>
      Not trusted yet
    </HeaderBadge>
  );
}

const badgeIn = (container: HTMLElement) => container.querySelector("button") as HTMLButtonElement;

verifies("kit.header-badge", () => {
  it("is a neutral chip, 24px high, that a hover steps up and focus rings", () => {
    const badge = badgeIn(render(trustBadge()).container);
    expect(badge.type).toBe("button");
    for (const part of [
      "h-6",
      "rounded-xs",
      "bg-surface-muted",
      "text-caption",
      "text-fg-muted",
      "gap-1.5",
      "hover:bg-border",
      "hover:text-fg",
      "focus-ring",
      "border-transparent",
      "contrast-more:border-border-control",
    ]) {
      expect(badge.className.split(" ")).toContain(part);
    }
    expect(badge.className).not.toContain("warning");
  });

  it("as a button reads 'Not trusted yet · Review', only Review in accent text", () => {
    const badge = badgeIn(render(trustBadge()).container);
    expect(badge.textContent).toBe("Not trusted yet · Review");
    expect(badge.querySelector(".text-accent-text")?.textContent).toBe("Review");
    expect(badge.getAttribute("aria-label")).toBe("Not trusted yet. Review");
    expect(badge.hasAttribute("aria-haspopup")).toBe(false);
    expect(badge.hasAttribute("aria-expanded")).toBe(false);
    expect(badge.className).toContain("px-2");
    // One icon, hidden: the dashed ring, no chevron.
    expect(badge.querySelectorAll("svg")).toHaveLength(1);
    expect(badge.querySelector("[aria-hidden=true]")?.className).toContain("size-3.5");
  });

  it("as a button calls onClick", async () => {
    const onClick = vi.fn();
    await click(badgeIn(render(trustBadge(onClick)).container));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("as a menu opens its Menu with the description, lined up at its right edge", async () => {
    const { container } = render(sampleChip());
    const badge = badgeIn(container);
    const menu = container.querySelector("[role=menu]") as HTMLElement;
    expect(badge.textContent).toBe("Sample · test model");
    expect(badge.querySelectorAll("svg")).toHaveLength(2);
    expect(badge.className).toContain("pr-1.5 pl-2");
    expect(badge.getAttribute("aria-haspopup")).toBe("menu");
    expect(badge.getAttribute("aria-expanded")).toBe("false");
    expect(menu.getAttribute("aria-labelledby")).toBe(badge.id);
    await click(badge);
    expect(isOpen(menu)).toBe(true);
    expect(badge.getAttribute("aria-expanded")).toBe("true");
    expect(menu.querySelector("p")?.textContent).toBe(costLine);
    expect(menu.querySelectorAll("[role=menuitem]")).toHaveLength(3);
  });

  it("shows a 2px accent ring while its Menu is open, and an edge in high contrast", () => {
    const badge = badgeIn(render(sampleChip()).container);
    expect(badge.className).toContain("aria-expanded:shadow-[0_0_0_2px_var(--color-accent)]");
    expect(badge.className).toContain("forced-colors:aria-expanded:outline-solid");
  });

  it("on a phone sits on its own 48px line with a 48px hit area, and wraps", () => {
    const { container } = render(onPhone(trustBadge()));
    const line = container.firstElementChild as HTMLElement;
    const badge = badgeIn(container);
    expect(line.className).toContain("min-h-touch");
    expect(line.className).toContain("border-b border-border");
    expect(badge.parentElement).toBe(line);
    expect(badge.className).toContain("phone:hit-touch");
    expect(badge.className).toContain("phone:whitespace-normal");
  });

  it("on a phone takes the name the feature gives", () => {
    const badge = badgeIn(
      render(onPhone(trustBadge(vi.fn(), "Not trusted yet. Open trust settings"))).container,
    );
    expect(badge.getAttribute("aria-label")).toBe("Not trusted yet. Open trust settings");
  });

  it("as a menu on a phone opens the sheet, not a Menu", async () => {
    const onOpenSheet = vi.fn();
    const { container } = render(onPhone(sampleChip(onOpenSheet)));
    const badge = badgeIn(container);
    expect(container.querySelector("[role=menu]")).toBeNull();
    expect(badge.hasAttribute("aria-haspopup")).toBe(false);
    await click(badge);
    expect(onOpenSheet).toHaveBeenCalledOnce();
  });
});
