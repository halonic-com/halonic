// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { type Tab, Tabs, type TabsProps } from "./tabs.tsx";

afterEach(() => {
  unmountAll();
});

type View = "flow" | "configuration" | "runs";

const views: readonly Tab<View>[] = [
  { id: "flow", label: "Flow" },
  { id: "configuration", label: "Configuration" },
  { id: "runs", label: "Runs" },
];

/** A page that keeps its own tab, as a real page does. */
function Page(props: Partial<TabsProps<View>> & { readonly start?: View }) {
  const [view, setView] = useState<View>(props.start ?? "flow");
  return (
    <Tabs
      label="Workflow views"
      tabs={views}
      selected={view}
      {...props}
      onSelect={(id) => {
        setView(id);
        props.onSelect?.(id);
      }}
    >
      <p>{view} view</p>
    </Tabs>
  );
}

function tabsIn(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

function selectedIn(container: HTMLElement): string | undefined {
  return tabsIn(container).find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
}

function press(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

verifies("kit.tabs", () => {
  it("is a named tab list with one panel, labelled by the selected tab", () => {
    const { container } = render(<Page />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    const panel = container.querySelector('[role="tabpanel"]') as HTMLElement;
    const [flow] = tabsIn(container);
    expect(list.getAttribute("aria-label")).toBe("Workflow views");
    expect(tabsIn(container).map((tab) => tab.textContent)).toEqual([
      "Flow",
      "Configuration",
      "Runs",
    ]);
    expect(panel.getAttribute("aria-labelledby")).toBe(flow?.id);
    expect(flow?.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.textContent).toBe("flow view");
  });

  it("draws a segmented track with the selected tab raised on it", () => {
    const { container } = render(<Page />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    const [flow, configuration] = tabsIn(container);
    expect(list.className).toContain("inline-flex");
    expect(list.className).toContain("gap-0.5 rounded-sm bg-surface-muted p-0.5");
    expect(flow?.className).toContain("rounded-segment text-small");
    expect(flow?.className).toContain("min-h-control-sm");
    expect(flow?.className).toContain("px-3");
    expect(flow?.className).toContain("bg-surface font-medium text-fg shadow-1");
    // High contrast drops the fill and the shadow and paints this outline instead.
    expect(flow?.className).toContain("selected-forced");
    expect(configuration?.className).toContain("text-fg-muted hover:text-fg");
    expect(configuration?.className).not.toContain("bg-surface");
    expect(flow?.className).toContain("focus-ring");
  });

  it("marks each unselected tab as a muted fill, and not the selected tab or the track", async () => {
    const tabs: readonly Tab<View>[] = [
      { id: "flow", label: "Flow" },
      { id: "configuration", label: "Configuration" },
      { id: "runs", label: "Runs", disabled: true },
    ];
    const { container } = render(<Page tabs={tabs} />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    const [flow, configuration, runs] = tabsIn(container);
    // The selected tab is a raised surface segment, so a counter on it keeps its normal look.
    expect(flow?.hasAttribute("data-fill")).toBe(false);
    expect(configuration?.getAttribute("data-fill")).toBe("muted");
    expect(runs?.getAttribute("data-fill")).toBe("muted");
    expect(list.hasAttribute("data-fill")).toBe(false);

    await click(configuration as HTMLElement);
    expect(flow?.getAttribute("data-fill")).toBe("muted");
    expect(configuration?.hasAttribute("data-fill")).toBe(false);
  });

  it("renders at 40px with a 48px hit area on a touch screen", () => {
    const { container } = render(<Page />);
    expect(tabsIn(container)[0]?.className).toContain("touch:min-h-control-lg touch:hit-touch");
  });

  it("selects a tab on click and leaves only the selected tab in the Tab order", async () => {
    const onSelect = vi.fn();
    const { container } = render(<Page onSelect={onSelect} />);
    await click(tabsIn(container)[2] as HTMLButtonElement);
    expect(onSelect).toHaveBeenCalledWith("runs");
    expect(selectedIn(container)).toBe("Runs");
    expect(tabsIn(container).map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe("runs view");
  });

  it("doesn't call onSelect for the tab that is already selected", async () => {
    const onSelect = vi.fn();
    const { container } = render(<Page onSelect={onSelect} />);
    await click(tabsIn(container)[0] as HTMLButtonElement);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("moves and selects with the arrow keys, wrapping round, and jumps with Home and End", () => {
    const { container } = render(<Page />);
    const [flow] = tabsIn(container);
    act(() => flow?.focus());
    press(flow as HTMLElement, "ArrowRight");
    expect(selectedIn(container)).toBe("Configuration");
    expect(document.activeElement?.textContent).toBe("Configuration");
    press(document.activeElement as HTMLElement, "End");
    expect(selectedIn(container)).toBe("Runs");
    press(document.activeElement as HTMLElement, "ArrowRight");
    expect(selectedIn(container)).toBe("Flow");
    press(document.activeElement as HTMLElement, "ArrowLeft");
    expect(selectedIn(container)).toBe("Runs");
    press(document.activeElement as HTMLElement, "Home");
    expect(selectedIn(container)).toBe("Flow");
    expect(document.activeElement?.textContent).toBe("Flow");
  });

  it("leaves other keys alone", () => {
    const { container } = render(<Page />);
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      tabsIn(container)[0]?.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(selectedIn(container)).toBe("Flow");
  });

  it("shows a disabled tab in fg-disabled, and clicks and the arrow keys skip it", async () => {
    const tabs: readonly Tab<View>[] = [
      { id: "flow", label: "Flow" },
      { id: "configuration", label: "Configuration", disabled: true },
      { id: "runs", label: "Runs" },
    ];
    const onSelect = vi.fn();
    const { container } = render(<Page tabs={tabs} onSelect={onSelect} />);
    const [flow, configuration] = tabsIn(container);
    expect(configuration?.getAttribute("aria-disabled")).toBe("true");
    expect(configuration?.hasAttribute("disabled")).toBe(false);
    expect(configuration?.className).toContain("text-fg-disabled text-forced-disabled");
    expect(configuration?.className).not.toContain("hover:text-fg");
    await click(configuration as HTMLButtonElement);
    expect(onSelect).not.toHaveBeenCalled();
    press(flow as HTMLElement, "ArrowRight");
    expect(selectedIn(container)).toBe("Runs");
  });

  it("goes to the last tab on ← from a selected tab that is disabled, and nowhere when all are", () => {
    const disabled = views.map((tab) => ({ ...tab, disabled: tab.id === "flow" }));
    const { container } = render(<Page tabs={disabled} />);
    press(tabsIn(container)[0] as HTMLElement, "ArrowLeft");
    expect(selectedIn(container)).toBe("Runs");

    const none = views.map((tab) => ({ ...tab, disabled: true }));
    const onSelect = vi.fn();
    const other = render(<Page tabs={none} onSelect={onSelect} />);
    press(tabsIn(other.container)[0] as HTMLElement, "End");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps the tab list reachable when the selected tab isn't one of them", () => {
    const { container } = render(
      <Tabs label="Views" tabs={views} selected={"gone" as View} onSelect={() => undefined}>
        …
      </Tabs>,
    );
    expect(tabsIn(container).map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(container.querySelector('[role="tabpanel"]')?.hasAttribute("aria-labelledby")).toBe(
      false,
    );
  });

  it("shows a counter that screen readers hear as words after the name", () => {
    const tabs: readonly Tab<View>[] = [
      { id: "flow", label: "Flow" },
      {
        id: "configuration",
        label: "Configuration",
        count: { value: 2, tone: "danger", name: "2 errors" },
      },
      { id: "runs", label: "Runs", count: { value: 12, name: "12 runs" } },
    ];
    const { container } = render(<Page tabs={tabs} />);
    const [, configuration, runs] = tabsIn(container);
    const chip = configuration?.querySelector('[aria-hidden="true"] > span') as HTMLElement;
    expect(chip.textContent).toBe("2");
    expect(chip.className).toContain("bg-danger-soft text-danger");
    expect(chip.className).toContain("rounded-full");
    expect(configuration?.querySelector(".sr-only")?.textContent).toBe(", 2 errors");
    expect(configuration?.className).not.toContain("danger");
    expect(runs?.querySelector('[aria-hidden="true"] > span')?.className).toContain(
      "bg-accent-soft",
    );
  });

  it("shows an icon before the label, hidden from screen readers", () => {
    const tabs: readonly Tab<View>[] = [{ id: "flow", label: "Flow", icon: <svg /> }];
    const { container } = render(<Page tabs={tabs} />);
    const icon = tabsIn(container)[0]?.firstElementChild as HTMLElement;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.className).toContain("size-icon-sm");
  });

  it("fills the column in equal parts on a phone, at least 48px high, with wrapping labels", () => {
    const tabs: readonly Tab<View>[] = [
      { id: "configuration", label: "Configuration", count: { value: 2, name: "2 errors" } },
    ];
    const { container } = render(
      <PresentationProvider presentation="phone">
        <Page tabs={tabs} start="configuration" />
      </PresentationProvider>,
    );
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    const [configuration] = tabsIn(container);
    expect(list.className).toContain("flex w-full");
    expect(configuration?.className).toContain("min-h-touch min-w-0 flex-1 basis-0 px-2 py-1");
    expect(configuration?.className).toContain("hyphens-auto wrap-break-word");
    expect(configuration?.className).not.toContain("whitespace-nowrap");
    // The counter follows the label like one more word.
    expect(configuration?.textContent).toBe("Configuration 2, 2 errors");
  });

  it("takes fill as a prop, over the presentation", () => {
    const { container } = render(
      <PresentationProvider presentation="phone">
        <Page fill={false} />
      </PresentationProvider>,
    );
    expect(tabsIn(container)[0]?.className).toContain("min-w-0 items-center gap-1.5 px-3");
  });

  it("wraps an inline label inside its tab when the tabs are wider than their column", () => {
    const { container } = render(<Page fill={false} />);
    const tab = tabsIn(container)[0];
    expect(tab?.className).toContain("min-w-0");
    expect(tab?.className).toContain("text-center hyphens-auto wrap-break-word");
    expect(tab?.className).not.toContain("whitespace-nowrap");
  });

  it("sticks to the top of the scroll area on a surface fill when sticky", () => {
    const { container } = render(<Page sticky />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    expect(list.parentElement?.className).toBe("sticky top-0 z-(--layer-sticky) bg-surface");
  });
});
