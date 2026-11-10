// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePopover, isOpen, restorePopover } from "../test/popover.ts";
import { click, render, unmountAll } from "../test/render.tsx";
import { ColourPopover, type ColourPreset } from "./colour-popover.tsx";
import { isDark, parseHex, sameColour } from "./hex.ts";

beforeEach(() => {
  fakePopover();
});

afterEach(() => {
  unmountAll();
  restorePopover();
});

const PRESETS: readonly ColourPreset[] = [
  { value: "#3B8BFF", name: "Blue" },
  { value: "#8B5CF6", name: "Violet" },
  { value: "#0B7052", name: "Green" },
  { value: "#A84B05", name: "Amber" },
  { value: "#C4143D", name: "Red" },
  { value: "#10102E", name: "Ink" },
  { value: "#E0559A", name: "Pink" },
  { value: "#0E9AA7", name: "Teal" },
];

/** The settings feature's first colour field: a box with the swatch button, and the popover. */
function FirstColour({ onChange }: { readonly onChange: (colour: string) => void }) {
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("#3B8BFF");
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <div data-box="">
        <button type="button" ref={opener} onClick={() => setOpen(!open)}>
          Choose the first colour, now {value}
        </button>
      </div>
      <ColourPopover
        id="first-colour"
        open={open}
        opener={opener}
        onClose={() => setOpen(false)}
        label="Choose the first colour"
        presets={PRESETS}
        value={value}
        onChange={(colour) => {
          setValue(colour);
          onChange(colour);
        }}
        presetsLabel="Presets"
        hexLabel="Hex colour"
        hexError="Use six digits, like #3B8BFF."
      />
      <a href="#elsewhere">Elsewhere</a>
    </form>
  );
}

async function openField() {
  const onChange = vi.fn();
  const { container } = render(<FirstColour onChange={onChange} />);
  const opener = container.querySelector("button") as HTMLButtonElement;
  opener.focus();
  await click(opener);
  const popover = container.querySelector('[role="dialog"]') as HTMLElement;
  const radios = [...popover.querySelectorAll<HTMLInputElement>('[type="radio"]')];
  const hex = popover.querySelector('input:not([type="radio"])') as HTMLInputElement;
  return { container, opener, popover, radios, hex, onChange };
}

/** Types into a controlled React input the way a browser does. */
function type(input: HTMLInputElement, text: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function key(element: Element, name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

function pressOn(element: Element): void {
  act(() => {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
}

verifies("kit.colour-popover", () => {
  it("opens from its button as a named dialog, 4px under the box, with focus on the picked preset", async () => {
    const { popover, radios } = await openField();
    expect(isOpen(popover)).toBe(true);
    expect(popover.getAttribute("popover")).toBe("manual");
    expect(popover.getAttribute("aria-label")).toBe("Choose the first colour");
    expect(popover.id).toBe("first-colour");
    expect(popover.className).toContain(
      "w-61 rounded-md border border-transparent bg-surface-raised p-3",
    );
    expect(popover.className).toContain("shadow-2");
    expect(popover.className).toContain("contrast-more:border-border-control");
    // jsdom's boxes are all zero, so the top is the gap alone.
    expect(popover.style.top).toBe("4px");
    expect(document.activeElement).toBe(radios[0]);
  });

  it("offers the presets as one radio group named by its heading, the picked one with a check", async () => {
    const { popover, radios } = await openField();
    const group = popover.querySelector('[role="radiogroup"]') as HTMLElement;
    const heading = document.getElementById(group.getAttribute("aria-labelledby") ?? "");
    expect(heading?.textContent).toBe("Presets");
    expect(heading?.className).toContain("text-caption uppercase tracking-label text-fg-muted");
    expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual(
      PRESETS.map((preset) => preset.name),
    );
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    expect(radios.map((radio) => radio.checked)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(radios[0]?.className).toContain("peer swatch");
    expect(radios[0]?.style.getPropertyValue("--swatch")).toBe("#3B8BFF");
    const tick = radios[0]?.nextElementSibling as SVGElement;
    expect(tick.getAttribute("class")).toContain(
      "size-3.5 text-on-primary forced-color-adjust-none peer-checked:block",
    );
    expect(group.className).toContain("grid-cols-[repeat(4,auto)]");
  });

  it("draws the check white on a dark swatch and ink on a light one, from the theme's tokens", async () => {
    const { radios } = await openField();
    expect(radios[5]?.nextElementSibling?.getAttribute("class")).toContain("scheme-light");
    expect(isDark("#10102E")).toBe(true);
    expect(isDark("#3B8BFF")).toBe(false);
    expect(isDark("#FFD84D")).toBe(false);
    expect(isDark("#3B8BFF".slice(1))).toBe(false);
    expect(isDark("nonsense")).toBe(false);
  });

  it("gives each swatch a 24px cell, a 48px target on a phone, and keeps no hidden colour input", async () => {
    const { container, radios } = await openField();
    const cell = radios[0]?.parentElement as HTMLElement;
    expect(cell.tagName).toBe("LABEL");
    expect(cell.className).toContain("size-6 place-items-center phone:size-12");
    expect(container.querySelector('input[type="color"]')).toBeNull();
  });

  it("applies a picked preset at once and writes it in the hex field", async () => {
    const { radios, hex, onChange } = await openField();
    await click(radios[1] as HTMLInputElement);
    expect(onChange).toHaveBeenCalledWith("#8B5CF6");
    expect(radios[1]?.checked).toBe(true);
    expect(radios[0]?.checked).toBe(false);
    expect(hex.value).toBe("#8B5CF6");
  });

  it("applies a typed hex as soon as it's six digits, and then no preset is picked", async () => {
    const { radios, hex, onChange } = await openField();
    type(hex, "#2a7f6");
    expect(onChange).not.toHaveBeenCalled();
    type(hex, "#2a7f62");
    expect(onChange).toHaveBeenCalledWith("#2A7F62");
    expect(radios.every((radio) => !radio.checked)).toBe(true);
    // Leaving the field writes it the field's way.
    act(() => {
      hex.focus();
      hex.blur();
    });
    expect(hex.value).toBe("#2A7F62");
  });

  it("keeps the last good colour while the hex isn't one, and says why once you leave it or press Enter", async () => {
    const { radios, hex, onChange } = await openField();
    type(hex, "#3B8BF");
    expect(onChange).not.toHaveBeenCalled();
    expect(hex.getAttribute("aria-invalid")).toBeNull();
    const enter = key(hex, "Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(hex.getAttribute("aria-invalid")).toBe("true");
    const line = document.getElementById(hex.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toContain("Use six digits, like #3B8BFF.");
    expect(radios[0]?.checked).toBe(true);
    type(hex, "#3B8BFF");
    expect(hex.getAttribute("aria-invalid")).toBeNull();
  });

  it("closes on Escape and gives focus back to its button", async () => {
    const { opener, popover, radios } = await openField();
    key(radios[0] as HTMLInputElement, "Escape");
    expect(isOpen(popover)).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("closes on a press outside, but not on a press inside or on its button, which toggles it", async () => {
    const { container, opener, popover, hex } = await openField();
    pressOn(hex);
    expect(isOpen(popover)).toBe(true);
    pressOn(opener);
    expect(isOpen(popover)).toBe(true);
    // The button's own click closes it, rather than a press closing it and the click reopening it.
    await click(opener);
    expect(isOpen(popover)).toBe(false);
    await click(opener);
    expect(isOpen(popover)).toBe(true);
    pressOn(container.querySelector("a") as HTMLAnchorElement);
    expect(isOpen(popover)).toBe(false);
  });

  it("closes when focus leaves it", async () => {
    const { container, popover, hex } = await openField();
    const elsewhere = container.querySelector("a") as HTMLAnchorElement;
    act(() => {
      hex.focus();
      elsewhere.focus();
    });
    expect(isOpen(popover)).toBe(false);
  });

  it("starts each opening from the last good colour, without the last one's error", async () => {
    const { opener, popover, hex } = await openField();
    type(hex, "nope");
    key(hex, "Enter");
    key(hex, "Escape");
    await click(opener);
    expect(isOpen(popover)).toBe(true);
    expect(hex.value).toBe("#3B8BFF");
    expect(hex.getAttribute("aria-invalid")).toBeNull();
  });
});

describe("parseHex", () => {
  it("reads six digits with or without #, in any case, and writes them one way", () => {
    expect(parseHex("#3b8bff")).toBe("#3B8BFF");
    expect(parseHex(" 3B8BFF ")).toBe("#3B8BFF");
    expect(parseHex("#3B8")).toBeNull();
    expect(parseHex("#3B8BFG")).toBeNull();
    expect(parseHex("")).toBeNull();
    expect(sameColour("#3b8bff", "3B8BFF")).toBe(true);
    expect(sameColour("nope", "nope")).toBe(false);
  });
});
