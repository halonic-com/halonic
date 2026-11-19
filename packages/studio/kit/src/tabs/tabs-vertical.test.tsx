// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { type Tab, TabList, TabPanel, Tabs, useTabIds } from "./tabs.tsx";

afterEach(() => {
  unmountAll();
});

type PageId = "behaviour" | "model" | "harness";

const pages: readonly Tab<PageId>[] = [
  { id: "behaviour", label: "Behaviour" },
  { id: "model", label: "Model" },
  { id: "harness", label: "Harness" },
];

/** A Configuration page: its list of pages in a side column, the picked page beside it. */
function Configuration(props: { readonly tabs?: readonly Tab<PageId>[] }) {
  const ids = useTabIds();
  const [page, setPage] = useState<PageId>("behaviour");
  const tabs = props.tabs ?? pages;
  return (
    <div className="flex">
      <nav className="w-52">
        <TabList
          label="Pages"
          orientation="vertical"
          tabs={tabs}
          selected={page}
          onSelect={setPage}
          ids={ids}
        />
      </nav>
      <TabPanel ids={ids} tabs={tabs} selected={page}>
        <p>{page} page</p>
      </TabPanel>
    </div>
  );
}

function tabsIn(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

function selectedIn(container: HTMLElement): string | undefined {
  return tabsIn(container).find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
}

/** Presses a key on the focused tab; returns whether the list took it. */
function press(key: string): boolean {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    document.activeElement?.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

verifies("kit.tabs-vertical", () => {
  it("is a vertical tab list with one Tab stop, the selected page", () => {
    const { container } = render(<Configuration />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    expect(list.getAttribute("aria-orientation")).toBe("vertical");
    expect(list.getAttribute("aria-label")).toBe("Pages");
    expect(tabsIn(container).map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it("moves and selects with ↑ and ↓, wrapping round, and jumps with Home and End", () => {
    const { container } = render(<Configuration />);
    const panel = container.querySelector('[role="tabpanel"]') as HTMLElement;
    const [behaviour, model] = tabsIn(container);
    act(() => behaviour?.focus());

    expect(press("ArrowDown")).toBe(true);
    expect(selectedIn(container)).toBe("Model");
    expect(document.activeElement).toBe(model);
    expect(panel.getAttribute("aria-labelledby")).toBe(model?.id);
    expect(panel.textContent).toBe("model page");
    expect(tabsIn(container).map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);

    press("End");
    expect(selectedIn(container)).toBe("Harness");
    press("ArrowDown");
    expect(selectedIn(container)).toBe("Behaviour");
    press("ArrowUp");
    expect(selectedIn(container)).toBe("Harness");
    press("Home");
    expect(selectedIn(container)).toBe("Behaviour");
    expect(document.activeElement).toBe(behaviour);
  });

  it("leaves ← and → alone", () => {
    const { container } = render(<Configuration />);
    act(() => tabsIn(container)[0]?.focus());
    expect(press("ArrowRight")).toBe(false);
    expect(press("ArrowLeft")).toBe(false);
    expect(selectedIn(container)).toBe("Behaviour");
  });

  it("skips a disabled page with the arrow keys", () => {
    const tabs = pages.map((tab) => ({ ...tab, disabled: tab.id === "model" }));
    const { container } = render(<Configuration tabs={tabs} />);
    act(() => tabsIn(container)[0]?.focus());
    press("ArrowDown");
    expect(selectedIn(container)).toBe("Harness");
  });

  it("draws rows: the selected one on accent-soft, the others muted with a hover fill", () => {
    const { container } = render(<Configuration />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    const [behaviour, model] = tabsIn(container);
    expect(list.className).toBe("flex flex-col gap-1");
    expect(behaviour?.className).toContain("flex min-h-control-md w-full items-center");
    expect(behaviour?.className).toContain("text-start hyphens-auto wrap-break-word");
    expect(behaviour?.className).toContain("touch:min-h-touch");
    expect(behaviour?.className).toContain("bg-accent-soft font-medium text-fg selected-forced");
    expect(behaviour?.className).not.toContain("shadow-1");
    expect(model?.className).toContain("text-fg-muted hover:bg-surface-subtle hover:text-fg");
    // No muted track behind the rows, so a counter keeps its normal look.
    expect(model?.hasAttribute("data-fill")).toBe(false);
    // The rows are left-aligned text, so there's no width copy of the bold label.
    expect(behaviour?.querySelector(".invisible")).toBeNull();
  });

  it("puts a counter at the end of its row", () => {
    const tabs: readonly Tab<PageId>[] = [
      { id: "behaviour", label: "Behaviour" },
      { id: "model", label: "Problems", count: { value: 2, tone: "danger", name: "2 errors" } },
    ];
    const { container } = render(<Configuration tabs={tabs} />);
    const problems = tabsIn(container)[1] as HTMLElement;
    const label = problems.firstElementChild as HTMLElement;
    expect(label.textContent).toBe("Problems");
    expect(label.className).toBe("min-w-0 flex-1");
    expect(problems.textContent).toBe("Problems2, 2 errors");
  });

  it("stays rows on a phone, where a horizontal list fills the column", () => {
    const { container } = render(
      <PresentationProvider presentation="phone">
        <Configuration />
      </PresentationProvider>,
    );
    expect(container.querySelector('[role="tablist"]')?.className).toBe("flex flex-col gap-1");
  });

  it("says horizontal on the default list and leaves ↑ and ↓ alone there", () => {
    function Page() {
      const [page, setPage] = useState<PageId>("behaviour");
      return (
        <Tabs label="Views" tabs={pages} selected={page} onSelect={setPage}>
          …
        </Tabs>
      );
    }
    const { container } = render(<Page />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    expect(list.getAttribute("aria-orientation")).toBe("horizontal");
    act(() => tabsIn(container)[0]?.focus());
    expect(press("ArrowDown")).toBe(false);
    expect(press("ArrowUp")).toBe(false);
    expect(tabsIn(container)[0]?.getAttribute("aria-selected")).toBe("true");
  });
});
