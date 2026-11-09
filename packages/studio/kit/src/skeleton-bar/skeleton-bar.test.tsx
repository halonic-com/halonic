// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { SkeletonBar, type SkeletonBarKind, type SkeletonBarWidth } from "./skeleton-bar.tsx";

afterEach(() => {
  unmountAll();
});

function barClasses(kind: SkeletonBarKind, width: SkeletonBarWidth = "full"): string {
  const { container } = render(<SkeletonBar kind={kind} width={width} />);
  return (container.firstElementChild as HTMLElement).className;
}

verifies("kit.skeleton-bar", () => {
  it("is a still surface-muted block hidden from screen readers", () => {
    const { container } = render(<SkeletonBar kind="title" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.className).toContain("block border border-transparent bg-surface-muted");
    expect(bar.className).not.toMatch(/animate|pulse/);
  });

  it("keeps a transparent edge that high contrast paints once it drops the fill", () => {
    expect(barClasses("title")).toContain("border border-transparent");
    expect(barClasses("avatar")).toContain("border border-transparent");
  });

  it("has the height of the text it stands in for, at a width from the fixed set", () => {
    expect(barClasses("title", "2/5")).toContain("h-2.5 rounded-xs w-2/5");
    expect(barClasses("meta")).toContain("h-2 rounded-xs w-full");
  });

  it("has fixed sizes for the trailing bar, the heading bar and the leading block", () => {
    expect(barClasses("trailing")).toContain("h-2.5 w-20 rounded-xs");
    expect(barClasses("heading")).toContain("h-2 w-12 rounded-xs");
    expect(barClasses("icon")).toContain("size-icon-md shrink-0 rounded-xs");
    expect(barClasses("avatar")).toContain("size-7 shrink-0 rounded-full");
    expect(barClasses("avatar", "2/5")).not.toContain("w-2/5");
  });
});
