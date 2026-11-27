// @vitest-environment jsdom
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildCss } from "../test/build-css.spec.ts";
import { fakePopover, isOpen, restorePopover } from "../test/popover.ts";
import { render, unmountAll } from "../test/render.tsx";
import { RailButton, type RailButtonProps } from "./rail-button.tsx";

beforeEach(() => {
  fakePopover();
});

afterEach(() => {
  unmountAll();
  restorePopover();
});

function renderButton(props: Partial<RailButtonProps> = {}) {
  const onSelect = vi.fn();
  const { container } = render(
    <RailButton
      label="Messenger"
      icon={(selected) => <svg data-selected={selected} />}
      selected={false}
      onSelect={onSelect}
      {...props}
    />,
  );
  const target = container.querySelector("button, a") as HTMLElement;
  const drawing = target.querySelector("svg")?.parentElement as HTMLElement;
  const tooltip = container.querySelector("[role=tooltip]") as HTMLElement;
  return { target, drawing, tooltip, onSelect };
}

verifies("kit.rail-button", () => {
  it("draws its 24px drawing in a 40px round target with the focus ring, unfilled at rest", () => {
    const { target, drawing } = renderButton();
    expect(target.tagName).toBe("BUTTON");
    expect(target.getAttribute("aria-label")).toBe("Messenger");
    expect(target.hasAttribute("aria-current")).toBe(false);
    expect(target.className).toContain("size-10");
    expect(target.className).toContain("rounded-full focus-ring");
    expect(target.className).toContain("hover:bg-surface-muted active:bg-surface-muted");
    expect(target.className).not.toMatch(/(^| )bg-/);
    expect(drawing.className).toContain("size-6");
    expect(target.querySelector("svg")?.getAttribute("data-selected")).toBe("false");
  });

  it("marks the selected one as the current page, filled, with its selected drawing", () => {
    const { target } = renderButton({ selected: true });
    expect(target.getAttribute("aria-current")).toBe("page");
    expect(target.className).toContain("aria-[current=page]:bg-surface-muted");
    expect(target.className).toContain("forced-colors:aria-[current=page]:border-[Highlight]");
    expect(target.querySelector("svg")?.getAttribute("data-selected")).toBe("true");
  });

  it("shows a count above 0 in the badge and says it after the name", () => {
    const { target } = renderButton({ selected: true, count: { value: 2, name: "2 unread" } });
    expect(target.getAttribute("aria-label")).toBe("Messenger, 2 unread");
    const badge = target.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(badge.textContent).toBe("2");
    expect(badge.className).toContain("-end-1.25 -top-0.75 grid h-5 min-w-5");
    expect(badge.className).toContain("bg-accent");
    expect(badge.className).toContain("ring-2 ring-canvas");
  });

  it("shows no badge for a count of 0", () => {
    const { target } = renderButton({ count: { value: 0, name: "0 unread" } });
    expect(target.getAttribute("aria-label")).toBe("Messenger");
    expect(target.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("calls onSelect on a click and never follows its address", () => {
    const { target, onSelect } = renderButton({ label: "Library", href: "#library" });
    expect(target.tagName).toBe("A");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      target.dispatchEvent(click);
    });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(click.defaultPrevented).toBe(true);
  });

  it("shows its name as a tooltip beside it on keyboard focus, without describing itself", () => {
    const { target, tooltip } = renderButton();
    expect(tooltip.textContent).toBe("Messenger");
    expect(target.hasAttribute("aria-describedby")).toBe(false);
    vi.spyOn(target, "matches").mockImplementation((selector) => selector === ":focus-visible");
    act(() => target.focus());
    expect(isOpen(tooltip)).toBe(true);
    expect(tooltip.dataset["side"]).toBe("beside");
  });
});

verifies("kit.rail-button-motion", () => {
  it("scales the drawing on hover and press only when motion is allowed", async () => {
    const { drawing } = renderButton();
    const classes = drawing.className.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining([
        "duration-(--duration-rail-hover)",
        "ease-press",
        "motion-safe:group-hover/rail-button:scale-110",
        "motion-safe:group-active/rail-button:scale-90",
        "group-active/rail-button:duration-(--duration-rail-press)",
      ]),
    );
    const css = await buildCss(["motion-safe:group-hover/rail-button:scale-110"]);
    expect(css).toContain("prefers-reduced-motion: no-preference");
  });

  it("doesn't scale the selected button, and eases its drawing back to 100%", () => {
    const { drawing } = renderButton({ selected: true });
    expect(drawing.className).not.toContain("scale");
    expect(drawing.className).toContain(
      "transition-transform duration-(--duration-rail-hover) ease-press",
    );
  });

  it("scales only under its own named group, not a group round it", () => {
    const { target, drawing } = renderButton();
    expect(target.className.split(" ")).toContain("group/rail-button");
    expect(drawing.className).not.toMatch(/group-(hover|active):/);
  });

  it("is the only kit part that grows or shrinks under the pointer or when pressed", async () => {
    const source = path.join(import.meta.dirname, "..");
    const files = (await readdir(source, { recursive: true })).filter(
      (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file),
    );
    const scaling: string[] = [];
    for (const file of files) {
      const text = await readFile(path.join(source, file), "utf8");
      // Named groups too: `group-hover/rail-button:scale-110`.
      if (/(hover|active)(\/[\w-]+)?:scale-/.test(text))
        scaling.push(file.split(path.sep).join("/"));
    }
    expect(scaling).toEqual(["rail-button/rail-button.tsx"]);
  });
});

verifies("kit.rail-button-count-cap", () => {
  it("shows 99+ past 99 and still says the whole count", () => {
    const { target } = renderButton({ count: { value: 120, name: "120 unread" } });
    expect(target.getAttribute("aria-label")).toBe("Messenger, 120 unread");
    expect(target.querySelector('[aria-hidden="true"]')?.textContent).toBe("99+");
  });

  it("shows 99 as it is", () => {
    const { target } = renderButton({ count: { value: 99, name: "99 unread" } });
    expect(target.querySelector('[aria-hidden="true"]')?.textContent).toBe("99");
  });
});
