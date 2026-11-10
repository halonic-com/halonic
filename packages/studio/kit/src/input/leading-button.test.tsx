// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Field } from "../field/field.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { Input, type InputProps } from "./input.tsx";

afterEach(() => {
  unmountAll();
});

const swatch = <span className="size-4 rounded-xs" style={{ background: "#3B8BFF" }} />;

/** The settings feature's first colour field, as T1-F46 draws it. */
function colourField(props: Partial<InputProps> = {}, onClick = vi.fn()) {
  const { container } = render(
    <Field label="First colour">
      <Input
        defaultValue="#3B8BFF"
        leadingButton={{ label: "Choose the first colour, now #3B8BFF", onClick, children: swatch }}
        {...(props as object)}
      />
    </Field>,
  );
  const button = container.querySelector("button") as HTMLButtonElement;
  const text = container.querySelector("input") as HTMLInputElement;
  return { container, button, text, onClick };
}

verifies("kit.input-leading-button", () => {
  it("is a real button named with the feature's verb and the value, its glyph hidden", () => {
    const { button } = colourField();
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Choose the first colour, now #3B8BFF");
    const glyph = button.firstElementChild as HTMLElement;
    expect(glyph.getAttribute("aria-hidden")).toBe("true");
    expect(glyph.className).toContain("size-icon-sm");
    expect(button.hasAttribute("aria-haspopup")).toBe(false);
  });

  it("comes before the text, so Tab goes to the button and then the text", () => {
    const { container, button, text } = colourField();
    const focusable = [...container.querySelectorAll<HTMLElement>("button, input")];
    expect(focusable).toEqual([button, text]);
    expect(button.tabIndex).toBe(0);
    expect(text.tabIndex).toBe(0);
  });

  it("has a 24px hit area 4px from the box's edge, with the text 8px after it, and 48 by 48 on a phone", () => {
    const { button } = colourField();
    // The box pads 10px; -6px puts the hit area 4px from its edge, and its gap-2 starts the text.
    expect(button.className).toContain("-ml-1.5 inline-grid size-6");
    expect((button.parentElement as HTMLElement).className).toContain(
      "gap-2 rounded-sm border px-2.5",
    );
    // On a phone it pulls back the 12px padding and the 1px edge, top and bottom too: 48 by 48
    // from the box's outer edge. The box's 8px gap stays, so the text starts at 56px.
    expect(button.className).toContain(
      "phone:-my-px phone:-ml-3.25 phone:h-auto phone:w-touch phone:self-stretch",
    );
    expect(button.className).not.toContain("-mr-");
  });

  it("shows the general focus ring, while the box's accent edge follows only the text", () => {
    const { button, text } = colourField();
    expect(button.className).toContain("focus-ring");
    expect(button.className).not.toMatch(/\bhover:bg-/);
    expect(boxClasses(text)).toContain("focus-field");
    expect(text.hasAttribute("data-field-text")).toBe(true);
  });

  it("calls onClick and leaves focus out of the text", async () => {
    const { button, text, onClick } = colourField();
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      button.dispatchEvent(press);
    });
    // The box's press-to-focus leaves a press on its button alone.
    expect(press.defaultPrevented).toBe(false);
    await click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(text);
  });

  it("is disabled with its Input, its glyph at 45%", () => {
    const { button } = colourField({ disabled: true });
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("disabled:cursor-not-allowed disabled:opacity-45");
  });

  it("is disabled while its Input is read-only, so a view-only colour can't change", () => {
    const { button, text } = colourField({ readOnly: true });
    expect(button.disabled).toBe(true);
    expect(text.readOnly).toBe(true);
    expect(boxClasses(text)).toContain("bg-surface-subtle");
  });

  it("stays usable in a field with an error, where the box takes the danger edge", () => {
    const { container } = render(
      <Field label="First colour" error="Use six digits, like #3B8BFF.">
        <Input
          defaultValue="#3B8BF"
          leadingButton={{
            label: "Choose the first colour, now #3B8BFF",
            onClick: vi.fn(),
            children: swatch,
          }}
        />
      </Field>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(boxClasses(container.querySelector("input") as HTMLInputElement)).toContain(
      "border-danger",
    );
  });

  it("says it opens a dialog when it opens a popover, and names it while open", () => {
    const leading = (expanded: boolean) => ({
      label: "Choose the first colour, now #3B8BFF",
      onClick: vi.fn(),
      children: swatch,
      expanded,
      controls: "first-colour-popover",
    });
    const { container, rerender } = render(
      <Input aria-label="First colour" leadingButton={leading(false)} />,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.hasAttribute("aria-controls")).toBe(false);
    rerender(<Input aria-label="First colour" leadingButton={leading(true)} />);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe("first-colour-popover");
  });

  it("holds an icon or a button at its start, never both", () => {
    const both = (
      // @ts-expect-error: a leading icon and a leading button at once
      <Input
        aria-label="First colour"
        leadingIcon={swatch}
        leadingButton={{ label: "Choose", onClick: vi.fn(), children: swatch }}
      />
    );
    expect(both).toBeDefined();
  });
});

/** The box round the text: the element that carries the field's look. */
function boxClasses(text: HTMLInputElement): string {
  return (text.parentElement as HTMLElement).className;
}
