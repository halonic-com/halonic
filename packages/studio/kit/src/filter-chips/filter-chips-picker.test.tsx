// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { buttonNamed, dialogOf, fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { fakePopover, isOpen, restorePopover } from "../test/popover.ts";
import { click, render, unmountAll } from "../test/render.tsx";
import { FilterChips, type FilterPicker } from "./filter-chips.tsx";

beforeEach(() => {
  fakePopover();
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restorePopover();
  restoreDialogPage();
});

function hub(overrides: Partial<FilterPicker> = {}): FilterPicker {
  return {
    label: "Hub",
    all: "All hubs",
    options: [
      { value: "acme", label: "acme" },
      { value: "beta", label: "beta" },
    ],
    value: undefined,
    onChange: () => undefined,
    ...overrides,
  };
}

function row(picker: FilterPicker, presentation: "desktop" | "phone" = "desktop") {
  return (
    <PresentationProvider presentation={presentation}>
      <FilterChips
        label="Filters"
        pickers={[picker]}
        toggles={[{ label: "Test runs", pressed: false, onChange: () => undefined }]}
      />
    </PresentationProvider>
  );
}

function radioNamed(dialog: HTMLElement, name: string): HTMLInputElement {
  const radio = [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
    (candidate) =>
      document.getElementById(candidate.getAttribute("aria-labelledby") ?? "")?.textContent ===
      name,
  );
  if (radio === undefined) {
    throw new Error(`No radio named ${name}`);
  }
  return radio;
}

verifies("kit.filter-chips", () => {
  it("draws a picker with nothing picked as the off chip with the all words and a 12px chevron", () => {
    const { container } = render(row(hub()));
    const chip = buttonNamed(container, "Hub: All hubs");
    expect(chip.textContent).toBe("All hubs");
    expect(chip.className).toContain("border-border-control bg-surface");
    expect(chip.className).toContain("pr-2 pl-3 text-fg-muted");
    const chevron = chip.querySelector("svg")?.parentElement as HTMLElement;
    expect(chevron.getAttribute("aria-hidden")).toBe("true");
    expect(chevron.className).toContain("size-3");
    expect(chip.querySelectorAll("svg")).toHaveLength(1);
    // Picker chips come before the on/off chips in the row.
    const chips = [...container.querySelectorAll("fieldset > button")];
    expect(chips.indexOf(chip)).toBe(0);
  });

  it("draws a picked picker as the on chip with the value and the chevron, but no check", () => {
    const { container } = render(row(hub({ value: "acme" })));
    const chip = buttonNamed(container, "Hub: acme");
    expect(chip.className).toContain("bg-accent-soft");
    expect(chip.className).toContain("pr-2 pl-3 font-medium text-accent-text");
    expect(chip.querySelectorAll("svg")).toHaveLength(1);
    expect(chip.querySelector("span")?.className).toContain("max-w-40 truncate");
  });

  it("opens a Menu of radio items on desktop, all first, and picks from it", async () => {
    const onChange = vi.fn();
    const { container } = render(row(hub({ value: "beta", onChange })));
    const chip = buttonNamed(container, "Hub: beta");
    expect(chip.getAttribute("aria-haspopup")).toBe("menu");
    const menu = container.querySelector('[role="menu"]') as HTMLElement;
    await click(chip);
    expect(isOpen(menu)).toBe(true);
    const items = [...menu.querySelectorAll('[role="menuitemradio"]')];
    expect(items.map((item) => item.textContent)).toEqual(["All hubs", "acme", "beta"]);
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    await click(items[1] as HTMLElement);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("acme");
    expect(isOpen(menu)).toBe(false);
    expect(document.activeElement).toBe(chip);

    await click(chip);
    await click(menu.querySelector('[role="menuitemradio"]') as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("opens the picker sheet on a phone, titled with the label, and a tap picks and closes", async () => {
    const onChange = vi.fn();
    const { container } = render(row(hub({ onChange }), "phone"));
    const chip = buttonNamed(container, "Hub: All hubs");
    expect(chip.getAttribute("aria-haspopup")).toBe("dialog");
    expect(container.querySelector("dialog")).toBeNull();
    await click(chip);
    const sheet = dialogOf(container);
    expect(sheet.querySelector("h2")?.textContent).toBe("Hub");
    const names = [...sheet.querySelectorAll('input[type="radio"]')].map(
      (radio) => document.getElementById(radio.getAttribute("aria-labelledby") ?? "")?.textContent,
    );
    expect(names).toEqual(["All hubs", "acme", "beta"]);
    expect(radioNamed(sheet, "All hubs").checked).toBe(true);
    await click(radioNamed(sheet, "beta"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("beta");
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("keeps the old value on Close, gives focus back to the chip, and picks all as undefined", async () => {
    const onChange = vi.fn();
    const { container } = render(row(hub({ value: "acme", onChange }), "phone"));
    const chip = buttonNamed(container, "Hub: acme");
    chip.focus();
    await click(chip);
    await click(buttonNamed(dialogOf(container), "Close"));
    expect(container.querySelector("dialog")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(chip);

    await click(buttonNamed(container, "Hub: acme"));
    await click(radioNamed(dialogOf(container), "All hubs"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("fills an off one-of chip on hover through its label, which covers the radio on a phone", () => {
    const { container } = render(
      <FilterChips
        label="Hub"
        options={[
          { value: "all", label: "All" },
          { value: "acme", label: "acme" },
        ]}
        value="all"
        onChange={() => undefined}
      />,
    );
    const off = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1];
    expect(off?.className).toContain(
      "group-hover:bg-surface-subtle group-active:bg-surface-subtle",
    );
  });
});
