// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modalOpened } from "../dialog/open-modals.ts";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { TOAST_FADE_MS } from "./toast-card.tsx";
import { ToastRegion } from "./toast-region.tsx";
import { createToastStore, type ToastStore } from "./toast-store.ts";

let store: ToastStore;

beforeEach(() => {
  vi.useFakeTimers();
  store = createToastStore();
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

function show(...messages: Parameters<ToastStore["show"]>[0][]): string[] {
  const ids: string[] = [];
  act(() => {
    for (const message of messages) {
      ids.push(store.show(message));
    }
  });
  return ids;
}

function pass(ms: number): void {
  act(() => vi.advanceTimersByTime(ms));
}

function cards(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("[data-toast]")];
}

function drawn(container: HTMLElement): string[] {
  return cards(container)
    .filter((card) => !card.classList.contains("sr-only"))
    .map((card) => card.querySelector("p")?.textContent ?? "");
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (element) => (element.getAttribute("aria-label") ?? element.textContent) === name,
  );
  if (found === undefined) {
    throw new Error(`No button named ${name}`);
  }
  return found;
}

verifies("kit.toast", () => {
  describe("the store", () => {
    it("lists toasts oldest first, closes one by id and tells its listeners", () => {
      const heard = vi.fn();
      const stop = store.subscribe(heard);
      const saved = store.show({ tone: "success", title: "Agent saved" });
      store.show({ tone: "danger", title: "Run failed" });
      store.close(saved);
      expect(store.list().map((toast) => toast.title)).toEqual(["Run failed"]);
      expect(heard).toHaveBeenCalledTimes(3);
      stop();
      store.close("toast-unknown");
      expect(heard).toHaveBeenCalledTimes(3);
    });
  });

  it("draws a card with the tone icon, the title, the line and a close button", () => {
    const { container } = render(<ToastRegion store={store} />);
    show({ tone: "success", title: "Agent saved", text: "Sorter is ready to run." });
    const region = container.firstElementChild;
    expect(region?.tagName).toBe("SECTION");
    expect(region?.getAttribute("aria-label")).toBe("Notifications");
    expect(region?.className).toContain("absolute right-4 bottom-4 z-(--layer-toast)");
    expect(region?.className).toContain("w-toast");
    const [card] = cards(container);
    expect(card?.getAttribute("role")).toBe("status");
    expect(card?.className).toContain("rounded-md");
    expect(card?.className).toContain("bg-surface-raised shadow-2");
    expect(card?.className).toContain("p-3");
    expect(card?.className).toContain("outline-1 outline-transparent -outline-offset-1");
    expect(card?.className).toContain("ease-enter");
    expect(card?.querySelector("[aria-hidden]")?.className).toContain("text-success");
    expect(card?.textContent).toContain("Sorter is ready to run.");
    expect(button(container, "Close Agent saved")).toBeTruthy();
  });

  it("makes a danger toast an alert that stays until it's closed", () => {
    const { container } = render(<ToastRegion store={store} />);
    show({ tone: "danger", title: "Run failed" });
    expect(cards(container)[0]?.getAttribute("role")).toBe("alert");
    expect(cards(container)[0]?.querySelector("[aria-hidden]")?.className).toContain("text-danger");
    pass(60_000);
    expect(drawn(container)).toEqual(["Run failed"]);
  });

  it("closes success after 5s and a toast with an action after 10s, fading out first", () => {
    const { container } = render(<ToastRegion store={store} />);
    show(
      { tone: "success", title: "Agent saved" },
      { tone: "info", title: "Run moved", action: { label: "Undo", onClick: () => undefined } },
    );
    pass(5000);
    expect(cards(container)[0]?.className).toContain("opacity-0 ease-exit");
    pass(TOAST_FADE_MS);
    expect(drawn(container)).toEqual(["Run moved"]);
    pass(5000 - TOAST_FADE_MS);
    pass(TOAST_FADE_MS);
    expect(store.list()).toHaveLength(0);
  });

  it("pauses the timer while focus is in the toast", () => {
    const { container } = render(<ToastRegion store={store} />);
    show({ tone: "success", title: "Agent saved" });
    pass(4000);
    act(() => button(container, "Close Agent saved").focus());
    pass(10_000);
    expect(store.list()).toHaveLength(1);
    act(() => button(container, "Close Agent saved").blur());
    pass(1000);
    pass(TOAST_FADE_MS);
    expect(store.list()).toHaveLength(0);
  });

  it("runs the action and closes the toast; the close button closes it too", async () => {
    const undo = vi.fn();
    const { container } = render(<ToastRegion store={store} />);
    show(
      { tone: "info", title: "Run moved", action: { label: "Undo", onClick: undo } },
      { tone: "warning", title: "Budget almost used" },
    );
    await click(button(container, "Undo"));
    await click(button(container, "Close Budget almost used"));
    pass(TOAST_FADE_MS);
    expect(undo).toHaveBeenCalledOnce();
    expect(store.list()).toHaveLength(0);
  });

  it("keeps three on desktop: a fourth closes the oldest", () => {
    const { container } = render(<ToastRegion store={store} />);
    show(
      { tone: "danger", title: "One" },
      { tone: "danger", title: "Two" },
      { tone: "danger", title: "Three" },
      { tone: "danger", title: "Four" },
    );
    expect(drawn(container)).toEqual(["Two", "Three", "Four"]);
  });

  it("wraps the text and the action as one group, so a long action goes under the text", () => {
    const { container } = render(<ToastRegion store={store} />);
    show({ tone: "danger", title: "Signed out", action: { label: "Sign in", onClick: vi.fn() } });
    const action = button(container, "Sign in");
    expect(action.parentElement?.className).toContain("flex-wrap items-start");
    expect(action.parentElement?.firstElementChild?.className).toContain("flex-[1_1_10rem]");
    expect(action.className).toContain("max-w-full flex-none");
    expect(action.className).toContain("hover:underline");
    expect(action.className).toContain("phone:hit-touch");
  });

  describe("focus", () => {
    it("goes to the newest toast's first button, and back where it was when that one closes", async () => {
      const { container } = render(
        <>
          <button type="button">Save</button>
          <ToastRegion store={store} />
        </>,
      );
      show({
        tone: "danger",
        title: "Run failed",
        action: { label: "Open run", onClick: vi.fn() },
      });
      const save = button(container, "Save");
      act(() => save.focus());
      act(() => store.focus());
      expect(document.activeElement).toBe(button(container, "Open run"));
      await click(button(container, "Open run"));
      pass(TOAST_FADE_MS);
      expect(document.activeElement).toBe(save);
    });
  });
});

verifies("kit.toast-waiting", () => {
  it("holds the cards back while a dialog is open, but keeps them in the page to be read", () => {
    const { container } = render(<ToastRegion store={store} />);
    let closed: () => void = () => undefined;
    act(() => {
      closed = modalOpened();
    });
    show({ tone: "success", title: "Agent saved" });
    expect(cards(container)[0]?.className).toBe("sr-only");
    expect(cards(container)[0]?.getAttribute("role")).toBe("status");
    pass(60_000);
    expect(store.list()).toHaveLength(1);
    act(() => closed());
    expect(drawn(container)).toEqual(["Agent saved"]);
  });

  it("shows one at a time on a phone, the rest waiting in order", () => {
    const { container } = render(
      <PresentationProvider presentation="phone">
        <ToastRegion store={store} />
      </PresentationProvider>,
    );
    const [first] = show(
      { tone: "danger", title: "One" },
      { tone: "danger", title: "Two" },
      { tone: "danger", title: "Three" },
      { tone: "danger", title: "Four" },
    );
    expect(drawn(container)).toEqual(["One"]);
    expect(cards(container)).toHaveLength(4);
    act(() => store.close(first ?? ""));
    expect(drawn(container)).toEqual(["Two"]);
  });
});
