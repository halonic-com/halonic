// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type Presentation, PresentationProvider } from "../presentation/presentation.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { ToastRegion } from "./toast-region.tsx";
import { createToastStore, type ToastStore } from "./toast-store.ts";

/**
 * jsdom has no layout, so each test gives the boxes the browser measured at 195 × 421 for "Go back
 * to this version" (UX check C289, TO1): the page's wrapper starts under the 56px top bar, the
 * toast at the bottom is 151px high, from 261 to 412.
 */
const wrapperBox = DOMRect.fromRect({ x: 0, y: 56, width: 195, height: 365 });
const toastBox = DOMRect.fromRect({ x: 16, y: 261, width: 163, height: 151 });

let store: ToastStore;
let boxes: Map<Element, DOMRect>;

beforeEach(() => {
  vi.useFakeTimers();
  store = createToastStore();
  boxes = new Map();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute("data-toast")) {
      return toastBox;
    }
    return boxes.get(this) ?? new DOMRect();
  });
});

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** The region and a button, in a wrapper placed as the shell places it, with the button's box. */
function page(presentation: Presentation, buttonBox: DOMRect) {
  const { container } = render(
    <PresentationProvider presentation={presentation}>
      <button type="button">Go back to this version</button>
      <ToastRegion store={store} />
    </PresentationProvider>,
  );
  const button = container.querySelector("button");
  const region = container.querySelector("section");
  if (button === null || region === null) {
    throw new Error("The page needs its button and its region.");
  }
  boxes.set(container, wrapperBox);
  boxes.set(button, buttonBox);
  return { button, region };
}

function show(title: string): string {
  let id = "";
  act(() => {
    id = store.show({ tone: "success", title, action: { label: "Undo", onClick: () => {} } });
  });
  return id;
}

/** Where the region's drawn toast is in the window, from the top it was given. */
function toastAt(region: HTMLElement): DOMRect {
  const top = region.style.top === "" ? null : Number.parseFloat(region.style.top);
  const y = top === null ? toastBox.y : wrapperBox.y + top;
  return DOMRect.fromRect({ x: toastBox.x, y, width: toastBox.width, height: toastBox.height });
}

function overlap(a: DOMRect, b: DOMRect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return Math.max(width, 0) * Math.max(height, 0);
}

const underTheToast = DOMRect.fromRect({ x: 16, y: 309, width: 163, height: 58 });

verifies("kit.toast-clear-of-focus", () => {
  it("moves a toast that would cover the focused button 8px under the top bar (195px)", () => {
    const { button, region } = page("phone", underTheToast);
    act(() => button.focus());
    expect(overlap(toastBox, underTheToast)).toBeGreaterThan(0);
    show("Went back to 14:02");
    expect(region.style.top).toBe("8px");
    expect(region.style.bottom).toBe("auto");
    expect(overlap(toastAt(region), underTheToast)).toBe(0);
  });

  it("stays at the bottom when the toast is clear of the focused button (320px)", () => {
    const above = DOMRect.fromRect({ x: 16, y: 180, width: 288, height: 40 });
    const { button, region } = page("phone", above);
    act(() => button.focus());
    show("Went back to 14:02");
    expect(region.style.top).toBe("");
    expect(overlap(toastAt(region), above)).toBe(0);
  });

  it("moves when focus comes back under the toast after it shows, as a menu's ⋮ does", () => {
    const { button, region } = page("phone", underTheToast);
    show("Restored");
    expect(region.style.top).toBe("");
    act(() => button.focus());
    expect(region.style.top).toBe("8px");
    expect(overlap(toastAt(region), underTheToast)).toBe(0);
  });

  it("starts the next toast at the bottom again", () => {
    const { button, region } = page("phone", underTheToast);
    act(() => button.focus());
    const first = show("Went back to 14:02");
    show("Went back to 13:40");
    expect(region.style.top).toBe("8px");
    act(() => button.blur());
    act(() => store.close(first));
    expect(region.style.top).toBe("");
  });

  it("on a short window, sits under the window's top and follows the bars as they scroll", () => {
    const { button, region } = page("phone", underTheToast);
    // `phone:short:fixed`: jsdom has no Tailwind, so the region is fixed by hand here.
    region.style.position = "fixed";
    const wrapper = region.parentElement as HTMLElement;
    boxes.set(wrapper, DOMRect.fromRect({ ...wrapperBox.toJSON(), y: -100 }));
    act(() => button.focus());
    show("Went back to 14:02");
    expect(region.style.top).toBe("8px");
    boxes.set(wrapper, DOMRect.fromRect({ ...wrapperBox.toJSON(), y: 20 }));
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    expect(region.style.top).toBe("28px");
  });

  it("stays at the bottom when it would cover the focused element at the top as well", () => {
    const tall = DOMRect.fromRect({ x: 16, y: 64, width: 163, height: 340 });
    const { button, region } = page("phone", tall);
    act(() => button.focus());
    show("Went back to 14:02");
    expect(region.style.top).toBe("");
  });

  it("never moves on desktop", () => {
    const { button, region } = page("desktop", underTheToast);
    act(() => button.focus());
    show("Went back to 14:02");
    expect(region.style.top).toBe("");
  });
});
