// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Button } from "../button/button.tsx";
import { Field } from "../field/field.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Input } from "./input.tsx";

afterEach(() => {
  unmountAll();
});

/** The box round the text: the element that carries the field's look. */
function boxOf(element: Element): string {
  return (element.parentElement as HTMLElement).className;
}

/** Presses a key in an element, the way a browser sends it, and says whether it was cancelled. */
function press(
  element: Element,
  init: KeyboardEventInit & { keyCode?: number },
): { cancelled: boolean } {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  if (init.keyCode !== undefined) {
    Object.defineProperty(event, "keyCode", { value: init.keyCode });
  }
  act(() => {
    element.dispatchEvent(event);
  });
  return { cancelled: event.defaultPrevented };
}

/** Presses the mouse on an element and says whether the press was cancelled. */
function mouseDown(element: Element, button = 0): { cancelled: boolean } {
  const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button });
  act(() => {
    element.dispatchEvent(event);
  });
  return { cancelled: event.defaultPrevented };
}

/** Renders a field in a form and records its submits. */
function inForm(field: ReactNode) {
  const onSubmit = vi.fn();
  const { container } = render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {field}
    </form>,
  );
  return { container, onSubmit };
}

verifies("kit.input", () => {
  it("draws the default box from tokens, with the field focus and a hover edge", () => {
    const { container } = render(<Input aria-label="Name" placeholder="Sorter" />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(boxOf(input)).toContain("border-border-control bg-surface hover:border-fg-muted");
    expect(boxOf(input)).toContain("focus-field");
    expect(boxOf(input)).toContain("min-h-control-md");
    expect(input.className).toContain("placeholder:text-fg-subtle");
    expect(input.hasAttribute("data-field-text")).toBe(true);
  });

  it("is 28px at sm, and 48px with 16px text on a phone", () => {
    const { container } = render(<Input aria-label="Name" size="sm" />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(boxOf(input)).toContain("min-h-control-sm");
    expect(boxOf(input)).toContain("phone:min-h-touch");
    expect(input.className).toContain("phone:text-input-touch");
  });

  it("has 16px text under a touch pointer, not only on a phone", () => {
    const { container } = render(<Input aria-label="Name" />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.className).toContain("touch:text-input-touch");
  });

  it("shows an error with the danger edge and the danger focus ring", () => {
    const { container } = render(
      <Field label="Name" error="Give the agent a name.">
        <Input />
      </Field>,
    );
    const box = boxOf(container.querySelector("input") as HTMLInputElement);
    expect(box).toContain("border-danger");
    expect(box).toContain("focus-field-danger");
    expect(box).not.toContain("hover:");
  });

  it("is read-only on a subtle fill, with no hover", () => {
    const { container } = render(<Input aria-label="Path" readOnly value="agents/sorter.md" />);
    const box = boxOf(container.querySelector("input") as HTMLInputElement);
    expect(box).toContain("bg-surface-subtle");
    expect(box).not.toContain("hover:");
  });

  it("is disabled with the disabled colours and no focus look", () => {
    const { container } = render(<Input aria-label="Name" disabled />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(boxOf(input)).toContain("border-border bg-surface-subtle text-fg-disabled");
    expect(boxOf(input)).not.toContain("focus-field");
  });

  it("puts a leading icon before the text and a trailing button after it", () => {
    const { container } = render(
      <Input
        aria-label="Search"
        leadingIcon={<svg data-testid="search" />}
        trailing={<button type="button">Clear</button>}
      />,
    );
    const box = container.querySelector("input")?.parentElement as HTMLElement;
    const [icon, input, clear] = Array.from(box.children);
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.className).toContain("text-fg-muted");
    expect(input?.tagName).toBe("INPUT");
    expect(clear?.textContent).toBe("Clear");
  });

  it("renders at lg under a coarse pointer, like the Buttons beside it", () => {
    const { container } = render(<Input aria-label="Name" size="sm" />);
    expect(boxOf(container.querySelector("input") as HTMLInputElement)).toContain(
      "touch:not-phone:min-h-control-lg",
    );
  });

  it("keeps 48px on a phone, which is a touch screen too: its touch height skips the phone", () => {
    const { container } = render(<Input aria-label="Name" />);
    const classes = boxOf(container.querySelector("input") as HTMLInputElement).split(" ");
    expect(classes).toContain("phone:min-h-touch");
    expect(classes.filter((name) => name.startsWith("touch:min-h-"))).toEqual([]);
  });

  it("shows the not-allowed cursor over a disabled box and its text", () => {
    const { container } = render(<Input aria-label="Name" disabled />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(boxOf(input)).toContain("cursor-not-allowed");
    expect(input.className).toContain("disabled:cursor-not-allowed");
  });

  it("puts the caret in the text on a press anywhere in the box, not on its button", () => {
    const { container } = render(
      <Input
        aria-label="Search"
        leadingIcon={<svg data-testid="search" />}
        trailing={<Button variant="ghost" size="sm" icon={<svg />} label="Clear search" />}
      />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const box = input.parentElement as HTMLElement;
    expect(input.className).toContain("self-stretch");

    expect(mouseDown(box).cancelled).toBe(true);
    expect(document.activeElement).toBe(input);

    input.blur();
    expect(mouseDown(box.querySelector("svg") as Element).cancelled).toBe(true);
    expect(document.activeElement).toBe(input);

    input.blur();
    expect(mouseDown(box.querySelector("button svg") as Element).cancelled).toBe(false);
    expect(document.activeElement).not.toBe(input);
    expect(mouseDown(input).cancelled).toBe(false);
  });

  it("leaves a right or middle press in the box to the browser", () => {
    const { container } = render(<Input aria-label="Name" leadingIcon={<svg />} />);
    const input = container.querySelector("input") as HTMLInputElement;
    const box = input.parentElement as HTMLElement;
    expect(mouseDown(box, 2).cancelled).toBe(false);
    expect(mouseDown(box, 1).cancelled).toBe(false);
    expect(document.activeElement).not.toBe(input);
  });

  it("keeps a trailing icon button at sm on a phone, with a 48px hit area", () => {
    const { container } = render(
      <Input
        aria-label="Search"
        trailing={<Button variant="ghost" size="sm" icon={<svg />} label="Clear search" />}
      />,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.className).toContain("size-control-sm phone:hit-touch touch:hit-touch");
    expect(button.className).not.toContain("size-touch");
  });

  it("passes other keys on to the screen's own handler", () => {
    const onKeyDown = vi.fn();
    const { container } = render(<Input aria-label="Name" onKeyDown={onKeyDown} />);
    press(container.querySelector("input") as HTMLInputElement, { key: "a" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});

verifies("kit.enter-while-composing", () => {
  it("doesn't let Enter submit an Input's form while an input method composes", () => {
    const onKeyDown = vi.fn();
    const { container } = inForm(<Input aria-label="Name" onKeyDown={onKeyDown} />);
    const input = container.querySelector("input") as HTMLInputElement;

    expect(press(input, { key: "Enter", isComposing: true }).cancelled).toBe(true);
    expect(press(input, { key: "Enter", keyCode: 229 }).cancelled).toBe(true);
    expect(onKeyDown).not.toHaveBeenCalled();

    expect(press(input, { key: "Enter" }).cancelled).toBe(false);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
