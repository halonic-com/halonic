// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Field } from "../field/field.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Slider, type SliderProps, sliderRatio } from "./slider.tsx";

afterEach(() => {
  unmountAll();
});

const percent = (value: number) => `${value}%`;

function rangeIn(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="range"]') as HTMLInputElement;
}

/** What the browser does while the thumb moves: a new value, then `input`. */
function move(range: HTMLInputElement, value: number): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(range, String(value));
    range.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** What the browser does when a drag lets go, or after each key step: `change`. */
function letGo(range: HTMLInputElement): void {
  act(() => {
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Panel opacity as Appearance shows it: the screen keeps the value as it moves. */
function Opacity(props: Partial<SliderProps> & { readonly onCommit: (value: number) => void }) {
  const [value, setValue] = useState(40);
  return (
    <Field label="Panel opacity">
      <Slider min={10} max={100} value={value} onChange={setValue} format={percent} {...props} />
    </Field>
  );
}

verifies("kit.slider", () => {
  it("is a native range input named by the Field's label, 32px high and 48px on a phone", () => {
    const { container } = render(<Opacity onCommit={vi.fn()} />);
    const range = rangeIn(container);
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(label.textContent).toContain("Panel opacity");
    expect(label.htmlFor).toBe(range.id);
    expect(range.min).toBe("10");
    expect(range.max).toBe("100");
    expect(range.value).toBe("40");
    expect(range.className).toContain("slider");
    expect(range.className).toContain("h-control-md");
    expect(range.className).toContain("phone:h-touch");
  });

  it("says the shown value as its aria-valuetext, and shows it to the right, hidden from screen readers", () => {
    const { container } = render(<Opacity onCommit={vi.fn()} />);
    const range = rangeIn(container);
    expect(range.getAttribute("aria-valuetext")).toBe("40%");
    const shown = range.nextElementSibling as HTMLElement;
    expect(shown.textContent).toBe("40%");
    expect(shown.getAttribute("aria-hidden")).toBe("true");
    expect(shown.className).toContain("min-w-[4ch] text-right text-body tabular-nums");
    expect((range.parentElement as HTMLElement).className).toContain("gap-3");
  });

  it("fills the track up to the thumb through --slider-ratio", () => {
    const { container } = render(<Opacity onCommit={vi.fn()} />);
    const range = rangeIn(container);
    // 40 on 10 to 100 is a third of the way.
    expect(Number.parseFloat(range.style.getPropertyValue("--slider-ratio"))).toBeCloseTo(0.333, 2);
    expect(sliderRatio(10, 10, 100)).toBe(0);
    expect(sliderRatio(100, 10, 100)).toBe(1);
    expect(sliderRatio(140, 10, 100)).toBe(1);
    expect(sliderRatio(5, 5, 5)).toBe(0);
  });

  it("updates the screen while it moves and saves once when a drag lets go", () => {
    const onCommit = vi.fn();
    const { container } = render(<Opacity onCommit={onCommit} />);
    const range = rangeIn(container);
    move(range, 50);
    move(range, 60);
    move(range, 70);
    expect(range.getAttribute("aria-valuetext")).toBe("70%");
    expect(onCommit).not.toHaveBeenCalled();
    letGo(range);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(70);
  });

  it("saves on every key step, because each one is a pick", () => {
    const onCommit = vi.fn();
    const { container } = render(<Opacity onCommit={onCommit} step={5} />);
    const range = rangeIn(container);
    // An arrow key: the browser moves one step, then fires input and change.
    for (const value of [45, 50, 55]) {
      move(range, value);
      letGo(range);
    }
    expect(onCommit.mock.calls).toEqual([[45], [50], [55]]);
  });

  it("saves a held key once, when it's let go, after saving its first press", () => {
    const onCommit = vi.fn();
    const { container } = render(<Opacity onCommit={onCommit} step={5} />);
    const range = rangeIn(container);
    const keyDown = (repeat: boolean) =>
      act(() => {
        range.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", repeat, bubbles: true }),
        );
      });
    keyDown(false);
    move(range, 45);
    letGo(range);
    for (const value of [50, 55, 60]) {
      keyDown(true);
      move(range, value);
      letGo(range);
    }
    expect(onCommit.mock.calls).toEqual([[45]]);
    act(() => {
      range.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }));
    });
    expect(onCommit.mock.calls).toEqual([[45], [60]]);
    // A key let go without repeats has nothing left to save.
    act(() => {
      range.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it("saves a held key once when focus leaves before it's let go, and the next drag saves too", () => {
    const onCommit = vi.fn();
    const { container } = render(<Opacity onCommit={onCommit} step={5} />);
    const range = rangeIn(container);
    act(() => {
      range.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true, bubbles: true }),
      );
    });
    move(range, 45);
    letGo(range);
    expect(onCommit).not.toHaveBeenCalled();
    // Tab or a click elsewhere: the keyup goes to another element.
    act(() => {
      range.dispatchEvent(new FocusEvent("blur"));
    });
    expect(onCommit.mock.calls).toEqual([[45]]);
    move(range, 70);
    letGo(range);
    expect(onCommit.mock.calls).toEqual([[45], [70]]);
  });

  it("saves nothing for a key held at the end of the range", () => {
    const onCommit = vi.fn();
    const { container } = render(<Opacity onCommit={onCommit} value={100} />);
    const range = rangeIn(container);
    // At the end the browser moves nothing, so no change fires.
    act(() => {
      range.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true, bubbles: true }),
      );
      range.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }));
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps the same ref callback across renders and sets the caller's ref", () => {
    const ref = vi.fn();
    const { rerender } = render(
      <Slider
        min={10}
        max={100}
        value={40}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        format={percent}
        ref={ref}
      />,
    );
    rerender(
      <Slider
        min={10}
        max={100}
        value={50}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        format={percent}
        ref={ref}
      />,
    );
    // Once with the element; a churning callback would also call it with null and again.
    expect(ref).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0]?.[0]).toBeInstanceOf(HTMLInputElement);
  });

  it("puts the thumb back when the screen passes the old value after a failed save", () => {
    const { container, rerender } = render(
      <Slider
        min={10}
        max={100}
        value={40}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        format={percent}
      />,
    );
    rerender(
      <Slider
        min={10}
        max={100}
        value={70}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        format={percent}
      />,
    );
    rerender(
      <Slider
        min={10}
        max={100}
        value={40}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        format={percent}
      />,
    );
    expect(rangeIn(container).value).toBe("40");
    expect(rangeIn(container).getAttribute("aria-valuetext")).toBe("40%");
  });

  it("is described by the Field's error line, where a failed save in a dialog says so", () => {
    const { container } = render(
      <Field label="Panel opacity" error="Couldn't save the opacity. It is back at 40%.">
        <Slider
          min={10}
          max={100}
          value={40}
          onChange={vi.fn()}
          onCommit={vi.fn()}
          format={percent}
        />
      </Field>,
    );
    const range = rangeIn(container);
    const line = document.getElementById(range.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toContain("Couldn't save the opacity. It is back at 40%.");
    expect(range.getAttribute("aria-invalid")).toBe("true");
  });

  describe("unavailable", () => {
    function renderUnavailable() {
      const onChange = vi.fn();
      const onCommit = vi.fn();
      const rendered = render(
        <>
          <Field label="Panel opacity">
            <Slider
              min={10}
              max={100}
              value={40}
              onChange={onChange}
              onCommit={onCommit}
              format={percent}
              unavailable={{ reason: "why" }}
            />
          </Field>
          <p id="why">Turn on See-through panels first.</p>
        </>,
      );
      return { range: rangeIn(rendered.container), onChange, onCommit };
    }

    it("stays focusable at 45%, keeps its value and points at its reason", () => {
      const { range } = renderUnavailable();
      expect(range.disabled).toBe(false);
      expect(range.getAttribute("aria-disabled")).toBe("true");
      expect(range.getAttribute("aria-describedby")?.split(" ")).toContain("why");
      const row = range.parentElement as HTMLElement;
      expect(row.className).toContain(
        "opacity-45 contrast-more:opacity-60 forced-colors:opacity-100",
      );
      range.focus();
      expect(document.activeElement).toBe(range);
    });

    it("can't be dragged or moved by keys, and saves nothing", () => {
      const { range, onChange, onCommit } = renderUnavailable();
      const press = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
      const arrow = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      });
      const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      act(() => {
        range.dispatchEvent(press);
        range.dispatchEvent(arrow);
        range.dispatchEvent(tab);
      });
      expect(press.defaultPrevented).toBe(true);
      expect(arrow.defaultPrevented).toBe(true);
      expect(tab.defaultPrevented).toBe(false);
      move(range, 70);
      letGo(range);
      expect(onChange).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
      expect(range.value).toBe("40");
    });
  });
});
