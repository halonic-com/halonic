// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Field } from "../field/field.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { TextArea } from "./text-area.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Makes every textarea measure `height` pixels of text, as a laid-out browser would. */
function textHeight(height: number): void {
  vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockReturnValue(height);
}

/** Stands in for the browser's ResizeObserver; `resize` reports a new width to every observer. */
function stubResizeObserver() {
  const callbacks = new Set<ResizeObserverCallback>();
  class FakeResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe() {
      callbacks.add(this.callback);
    }
    unobserve() {}
    disconnect() {
      callbacks.delete(this.callback);
    }
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  return {
    get observers() {
      return callbacks.size;
    },
    resize(width: number) {
      const entry = { contentRect: { width } } as ResizeObserverEntry;
      act(() => {
        for (const callback of callbacks) {
          callback([entry], {} as ResizeObserver);
        }
      });
    },
  };
}

/** Presses a key in an element, the way a browser sends it. */
function press(element: Element, init: KeyboardEventInit & { keyCode?: number }): void {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  if (init.keyCode !== undefined) {
    Object.defineProperty(event, "keyCode", { value: init.keyCode });
  }
  act(() => {
    element.dispatchEvent(event);
  });
}

/** Renders a TextArea in a form and records the form's submits. */
function renderInForm() {
  const onSubmit = vi.fn();
  const { container } = render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TextArea aria-label="Message" />
    </form>,
  );
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  return { textarea, onSubmit };
}

verifies("kit.text-area", () => {
  it("draws the Input's box, at least 48px on a phone", () => {
    const { container } = render(<TextArea aria-label="Notes" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const box = (textarea.parentElement as HTMLElement).className;
    expect(box).toContain("border-border-control bg-surface hover:border-fg-muted focus-field");
    expect(box).toContain("phone:min-h-touch");
    expect(textarea.hasAttribute("data-field-text")).toBe(true);
  });

  it("is wired by its Field and shows the error edge", () => {
    const { container } = render(
      <Field label="Message" error="Write a message.">
        <TextArea />
      </Field>,
    );
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(container.querySelector("label")?.htmlFor).toBe(textarea.id);
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect((textarea.parentElement as HTMLElement).className).toContain("focus-field-danger");
  });

  it("grows up to five lines by default, then scrolls", () => {
    const { container } = render(<TextArea aria-label="Notes" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.rows).toBe(1);
    expect(textarea.style.maxHeight).toBe("5lh");
    expect(textarea.className).toContain("overflow-y-auto");
  });

  it("takes the height of its text", () => {
    textHeight(60);
    const { container } = render(<TextArea aria-label="Notes" />);
    expect(container.querySelector("textarea")?.style.height).toBe("60px");
  });

  it("isn't 0px tall after it mounts hidden, and fits its text once it's shown", () => {
    const resizes = stubResizeObserver();
    textHeight(0);
    const { container } = render(<TextArea aria-label="Notes" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.style.height).toBe("");

    textHeight(40);
    resizes.resize(300);
    expect(textarea.style.height).toBe("40px");
  });

  it("fits its text again when its width changes, not when only its height does", () => {
    const resizes = stubResizeObserver();
    textHeight(40);
    const { container } = render(<TextArea aria-label="Notes" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    resizes.resize(300);

    textHeight(80);
    resizes.resize(300);
    expect(textarea.style.height).toBe("40px");
    resizes.resize(150);
    expect(textarea.style.height).toBe("80px");

    unmountAll();
    expect(resizes.observers).toBe(0);
  });

  it("takes another line limit", () => {
    const { container } = render(<TextArea aria-label="Instructions" maxRows={8} />);
    expect(container.querySelector("textarea")?.style.maxHeight).toBe("8lh");
  });

  it("adds a line on Enter, and submits its form on Ctrl Enter or ⌘ Enter", () => {
    const { textarea, onSubmit } = renderInForm();

    press(textarea, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();

    press(textarea, { key: "Enter", ctrlKey: true });
    press(textarea, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("doesn't submit on Ctrl Enter while an input method composes", () => {
    const { textarea, onSubmit } = renderInForm();

    press(textarea, { key: "Enter", ctrlKey: true, isComposing: true });
    press(textarea, { key: "Enter", ctrlKey: true, keyCode: 229 });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the Enter that ends a composition from the screen's handler, as the Input does", () => {
    const onKeyDown = vi.fn();
    const { container } = render(<TextArea aria-label="Message" onKeyDown={onKeyDown} />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    press(textarea, { key: "Enter", isComposing: true });
    press(textarea, { key: "Enter", keyCode: 229 });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("leaves Ctrl Enter to the screen when it has no form", () => {
    const onKeyDown = vi.fn((event: { defaultPrevented: boolean }) => event.defaultPrevented);
    const { container } = render(<TextArea aria-label="Message" onKeyDown={onKeyDown} />);
    press(container.querySelector("textarea") as HTMLTextAreaElement, {
      key: "Enter",
      ctrlKey: true,
    });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveReturnedWith(false);
  });

  it("passes other keys on to the screen's own handler", () => {
    const onKeyDown = vi.fn();
    const { container } = render(<TextArea aria-label="Notes" onKeyDown={onKeyDown} />);
    press(container.querySelector("textarea") as HTMLTextAreaElement, { key: "a" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
