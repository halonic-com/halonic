// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { type BadgeRegistry, createBadgeRegistry, trustBadgePriority } from "./badge-registry.ts";
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

/** A registry with the trust badge and two connector states, one a button and one a chip. */
function stripRegistry(): BadgeRegistry {
  const registry = createBadgeRegistry();
  registry.add({ id: "api-off", label: "Gmail API off", tone: "attention", priority: 10 });
  registry.add({
    id: "needs-sign-in",
    label: "Needs sign-in again",
    tone: "attention",
    priority: 10,
    action: "Fix",
    onSelect: () => {},
  });
  registry.add({
    id: "workspace-trust",
    label: "Not trusted yet",
    tone: "neutral",
    priority: trustBadgePriority,
    action: "Review",
    onSelect: () => {},
  });
  return registry;
}

function renderStrip(registry: BadgeRegistry): HTMLElement {
  return render(
    <PresentationProvider presentation="phone">
      <HeaderBadges registry={registry} layout="strip" />
    </PresentationProvider>,
  );
}

verifies("shell.phone-notice-badges", () => {
  it("puts the trust badge on its own line, then the connector states in one row of chips", () => {
    const container = renderStrip(stripRegistry());
    const rows = [...container.querySelectorAll("[data-notice-row]")] as HTMLElement[];
    expect(rows.map((row) => row.textContent)).toEqual([
      "Not trusted yet · Review",
      "Gmail API offNeeds sign-in again · Fix",
    ]);
    const [trust, chips] = rows as [HTMLElement, HTMLElement];
    // The kit's phone line, indented 16px, without a line of its own: the row draws it.
    const line = trust.querySelector("button")?.closest(".min-h-touch") as HTMLElement;
    expect(line.className).toContain("ps-4");
    expect(line.className).not.toContain("border-b");
    // The chips wrap, 8px apart, with no line around each.
    for (const part of ["flex-wrap", "gap-2", "px-4", "py-2", "bg-surface-subtle"]) {
      expect(chips.className.split(" ")).toContain(part);
    }
    expect(chips.querySelector(".min-h-touch")).toBeNull();
    // Each chip keeps its own size, so the row wraps instead of stacking full-width chips.
    for (const wrapper of chips.querySelectorAll("span:has(> button)")) {
      expect(wrapper.className.split(" ")).not.toContain("phone:grow");
    }
  });

  it("draws a line under each row, and leaves the rows out in a short window", () => {
    const container = renderStrip(stripRegistry());
    for (const row of container.querySelectorAll("[data-notice-row]")) {
      expect(row.className).toContain("border-b border-border");
      expect(row.className.split(" ")).toContain("short:hidden");
    }
  });

  it("shows no rows while there are no states, and no chip row without connector states", () => {
    const registry = createBadgeRegistry();
    const container = renderStrip(registry);
    expect(container.querySelectorAll("[data-notice-row]")).toHaveLength(0);
    act(() => {
      registry.add({
        id: "workspace-trust",
        label: "Not trusted yet",
        tone: "neutral",
        priority: trustBadgePriority,
        action: "Review",
        onSelect: () => {},
      });
    });
    expect(container.querySelectorAll("[data-notice-row]")).toHaveLength(1);
  });
});

verifies("shell.badge-gone-focus", () => {
  const trustBadge = {
    id: "trust",
    label: "Not trusted yet",
    tone: "neutral" as const,
    priority: 1000,
    action: "Review",
    onSelect: () => {},
  };

  /** The badges beside a page whose `h1` is "Acme". */
  function withPage(registry: ReturnType<typeof createBadgeRegistry>) {
    return render(
      <>
        <HeaderBadges registry={registry} />
        <main>
          <h1>Acme</h1>
          <button type="button">Run</button>
        </main>
      </>,
    );
  }

  it("gives focus to the page's h1 when the focused badge goes", () => {
    const registry = createBadgeRegistry();
    let remove = () => {};
    act(() => {
      remove = registry.add(trustBadge);
    });
    const container = withPage(registry);
    act(() => container.querySelector<HTMLButtonElement>("button")?.focus());

    act(() => remove());

    expect(document.activeElement).toBe(container.querySelector("main h1"));
  });

  it("leaves focus alone when the badge goes while something else has it", () => {
    const registry = createBadgeRegistry();
    let remove = () => {};
    act(() => {
      remove = registry.add(trustBadge);
    });
    const container = withPage(registry);
    const run = container.querySelector<HTMLButtonElement>("main button");
    act(() => run?.focus());

    act(() => remove());

    expect(document.activeElement).toBe(run);
  });
});
