// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { createBadgeRegistry } from "./badge-registry.ts";
import { HeaderBadges } from "./header-badges.tsx";

afterEach(() => unmountAll());

verifies("shell.header-badges", () => {
  it("shows nothing while there are no states", () => {
    const container = render(<HeaderBadges registry={createBadgeRegistry()} />);
    expect(container.textContent).toBe("");
  });

  it("shows a state as a chip, follows additions and removals, and puts the trust badge first", () => {
    const registry = createBadgeRegistry();
    const container = render(<HeaderBadges registry={registry} />);
    let remove = () => {};
    act(() => {
      remove = registry.add({ id: "api-off", label: "API off", tone: "attention", priority: 10 });
      registry.add({
        id: "trust",
        label: "Not trusted yet",
        tone: "neutral",
        priority: 1000,
        action: "Review",
        onSelect: () => {},
      });
    });
    expect(container.textContent).toBe("Not trusted yet · ReviewAPI off");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    act(() => remove());
    expect(container.textContent).toBe("Not trusted yet · Review");
  });

  it("calls onSelect with the badge's button when it is pressed", () => {
    const registry = createBadgeRegistry();
    const onSelect = vi.fn();
    const container = render(<HeaderBadges registry={registry} />);
    act(() => {
      registry.add({
        id: "trust",
        label: "Not trusted yet",
        tone: "neutral",
        priority: 1000,
        action: "Review",
        onSelect,
      });
    });
    const button = container.querySelector("button");
    act(() => button?.click());
    expect(onSelect).toHaveBeenCalledWith(button);
  });
});
