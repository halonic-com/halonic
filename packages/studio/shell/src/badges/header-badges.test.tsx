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

  it("names the button with one full stop, also when the label ends a sentence", () => {
    const registry = createBadgeRegistry();
    const container = render(<HeaderBadges registry={registry} />);
    const badge = (label: string) => ({
      id: "trust",
      label,
      tone: "neutral" as const,
      priority: 1000,
      action: "Try again",
      onSelect: () => {},
    });
    let remove = () => {};
    act(() => {
      remove = registry.add(badge("Couldn't load workspace settings · Nothing to read"));
    });
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Couldn't load workspace settings · Nothing to read. Try again",
    );
    act(() => {
      remove();
      registry.add(badge("Couldn't load workspace settings · The folder has no location."));
    });
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Couldn't load workspace settings · The folder has no location. Try again",
    );
  });

  it("describes the button with its tooltip, so a screen reader reads it", () => {
    const registry = createBadgeRegistry();
    const container = render(<HeaderBadges registry={registry} />);
    const tooltip = "Routines and connectors start only in a trusted workspace.";
    act(() => {
      registry.add({
        id: "trust",
        label: "Not trusted yet",
        tone: "neutral",
        priority: 1000,
        action: "Review",
        onSelect: () => {},
        tooltip,
      });
    });
    const id = container.querySelector("button")?.getAttribute("aria-describedby") ?? "";
    expect(id).not.toBe("");
    expect(container.ownerDocument.getElementById(id)?.textContent).toBe(tooltip);
  });
});
