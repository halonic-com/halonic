// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Kbd } from "./kbd.tsx";

afterEach(() => {
  unmountAll();
});

verifies("kit.kbd", () => {
  it("draws one box per key, in order", () => {
    const { container } = render(<Kbd keys={["Ctrl", "Shift", "F"]} />);
    const keys = Array.from(container.querySelectorAll("kbd"));
    expect(keys.map((key) => key.textContent)).toEqual(["Ctrl", "Shift", "F"]);
    expect(keys[0]?.className).toContain("font-mono text-caption text-fg-muted");
    expect(keys[0]?.className).toContain("h-5 min-w-5");
    expect(keys[0]?.className).toContain("rounded-xs bg-surface-muted px-1");
  });

  it("keeps a key that appears twice", () => {
    const { container } = render(<Kbd keys={["G", "G"]} />);
    expect(container.querySelectorAll("kbd")).toHaveLength(2);
  });

  it("puts 2px between the boxes and hides them on a phone", () => {
    const { container } = render(<Kbd keys={["Ctrl", "K"]} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("gap-0.5");
    expect(wrapper.className).toContain("phone:hidden");
  });
});
