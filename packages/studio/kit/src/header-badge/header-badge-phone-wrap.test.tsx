// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { HeaderBadge } from "./header-badge.tsx";

afterEach(() => {
  unmountAll();
});

function onPhone(element: ReactNode): ReactNode {
  return <PresentationProvider presentation="phone">{element}</PresentationProvider>;
}

const trustBadge = (
  <HeaderBadge as="button" action="Review" onClick={vi.fn()}>
    Not trusted yet
  </HeaderBadge>
);

const sampleChip = (
  <HeaderBadge as="menu" entries={[]} onOpenSheet={vi.fn()}>
    Sample · test model
  </HeaderBadge>
);

const badgeIn = (container: HTMLElement) => container.querySelector("button") as HTMLButtonElement;

// jsdom lays nothing out, so these check the classes that let the badge fit a 195px line.
const wrapsOnPhone = [
  "phone:min-w-0",
  "phone:shrink",
  "phone:whitespace-normal",
  "phone:h-auto",
  "phone:items-start",
  "phone:py-0.75",
];

verifies("kit.header-badge-phone-wrap", () => {
  it("lets the trust badge shrink to its line and wrap between words on a phone", () => {
    const badge = badgeIn(render(onPhone(trustBadge)).container);
    const classes = badge.className.split(" ");
    for (const part of wrapsOnPhone) {
      expect(classes).toContain(part);
    }
    // Shrinking is only on a phone: the desktop status bar keeps it on one line.
    expect(classes).toContain("shrink-0");
    expect(classes).toContain("whitespace-nowrap");
    expect(classes).toContain("h-6");
  });

  it("keeps the line's 60px start", () => {
    const { container } = render(onPhone(trustBadge));
    const line = container.firstElementChild as HTMLElement;
    expect(line.className.split(" ")).toContain("ps-15");
  });

  it("keeps its icons one caption line high, so they stay level with the first line", () => {
    const badge = badgeIn(render(onPhone(trustBadge)).container);
    const icon = badge.querySelector("[aria-hidden=true]") as HTMLElement;
    expect(icon.className.split(" ")).toEqual(expect.arrayContaining(["h-4", "*:size-3.5"]));
  });

  it("lets the sample chip wrap the same way", () => {
    const chip = badgeIn(render(onPhone(sampleChip)).container);
    const classes = chip.className.split(" ");
    for (const part of wrapsOnPhone) {
      expect(classes).toContain(part);
    }
    for (const icon of chip.querySelectorAll("span[aria-hidden=true]")) {
      expect(icon.className.split(" ")).toContain("h-4");
    }
  });
});
