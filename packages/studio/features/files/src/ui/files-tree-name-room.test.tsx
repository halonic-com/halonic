// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { contextHost, contextOf, listing, rowNamed, settled } from "../test-support/sidebar.ts";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

/** What jsdom can't lay out or draw: one character's width, the room each name has, a canvas. */
const drawn = { ch: 7.5, name: 120, canvas: true };
const observers = new Set<() => void>();

/** Stands in for the browser's ResizeObserver; `resize` reports a new name width to every observer. */
class FakeResizeObserver {
  private readonly report: () => void;
  constructor(callback: ResizeObserverCallback) {
    this.report = () => callback([], this as unknown as ResizeObserver);
  }
  observe(): void {
    observers.add(this.report);
  }
  unobserve(): void {}
  disconnect(): void {
    observers.delete(this.report);
  }
}

function resize(name: number): void {
  drawn.name = name;
  act(() => {
    for (const report of observers) report();
  });
}

/** A canvas that draws every character `drawn.ch` wide, or none, as where text can't be measured. */
function fakeContext() {
  if (!drawn.canvas) return null;
  return {
    font: "10px sans-serif",
    measureText: (text: string) => ({ width: text.length * drawn.ch }),
  };
}

beforeEach(() => {
  Object.assign(drawn, { ch: 7.5, name: 120, canvas: true });
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return { width: this.hasAttribute("data-name") ? drawn.name : 0 } as DOMRect;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    fakeContext as unknown as HTMLCanvasElement["getContext"],
  );
});

afterEach(() => {
  unmountAll();
  observers.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const routines = "hubs/acme/workflows/routines";
const quarterly = "quarterly-board-report-for-the-whole-company.routine.yaml";
const monthly = "monthly-numbers-for-the-finance-team-and-board.routine.yaml";
const weekly = "weekly-report.routine.yaml";
const weeklyWorkflow = "weekly-report.workflow.yaml";

/** The Files sidebar with the routines folder open, five levels deep, as in Acme. */
async function showRoutines(): Promise<HTMLElement> {
  const paths = [quarterly, monthly, weekly].map((name) => `${routines}/${name}`);
  const host = contextHost();
  host.list = async () => listing([...paths, `hubs/acme/workflows/${weeklyWorkflow}`]);
  const page = render(<FilesSidebarView context={contextOf(host)} />);
  await settled();
  for (const folder of ["hubs", "hubs/acme", "hubs/acme/workflows", routines]) {
    act(() => rowNamed(page, folder).click());
  }
  return page;
}

const nameIn = (row: HTMLElement) => row.querySelector<HTMLElement>("[data-name]");

verifies("files.ui.tree-view", () => {
  it("cuts a deep name in the middle to its row's room, so its start and end show (HAL-13080)", async () => {
    const page = await showRoutines();
    const row = rowNamed(page, `${routines}/${quarterly}`);
    expect(row.getAttribute("aria-level")).toBe("5");
    expect(nameIn(row)?.textContent).toBe("quarter…ine.yaml");
    expect(nameIn(row)?.title).toBe(quarterly);
    expect(row.getAttribute("aria-label")).toBe(quarterly);
    expect(nameIn(rowNamed(page, `${routines}/${monthly}`))?.textContent).toBe("monthly…ine.yaml");
    expect(nameIn(rowNamed(page, `${routines}/${weekly}`))?.textContent).toBe("weekly-…ine.yaml");
    expect(nameIn(rowNamed(page, `hubs/acme/workflows/${weeklyWorkflow}`))?.textContent).toBe(
      "weekly-…low.yaml",
    );
    // The name fills the row's room, and the end cut stays as the fallback.
    expect(nameIn(row)?.className).toContain("flex-1");
    expect(nameIn(row)?.className).toContain("truncate");
  });

  it("cuts again when the sidebar's width changes, and shows a name whole once it fits (HAL-13080)", async () => {
    const page = await showRoutines();
    resize(30 * 7.5);
    expect(nameIn(rowNamed(page, `${routines}/${weekly}`))?.textContent).toBe(weekly);
    expect(nameIn(rowNamed(page, `${routines}/${weekly}`))?.hasAttribute("title")).toBe(false);
    expect(nameIn(rowNamed(page, `${routines}/${quarterly}`))?.textContent).toBe(
      "quarterly-boar…ny.routine.yaml",
    );
    resize(12 * 7.5);
    expect(nameIn(rowNamed(page, `${routines}/${weekly}`))?.textContent).toBe("weekl…e.yaml");
  });

  it("keeps the fixed cut where text can't be measured (HAL-13080)", async () => {
    drawn.canvas = false;
    const page = await showRoutines();
    const name = nameIn(rowNamed(page, `${routines}/${quarterly}`));
    expect(name?.textContent).toHaveLength(32);
    expect(name?.className).toContain("truncate");
  });
});
